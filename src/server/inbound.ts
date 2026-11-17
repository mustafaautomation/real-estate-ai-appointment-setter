import { isRelayFallback } from '@/adapters/relay/client';
import { qualifyWithRelay, replyLooksUsable } from '@/adapters/relay/qualify';
import { hasBookingIntent, isStopKeyword, wantsHuman } from '@/domain/booking/schedule';
import { formatWhen } from '@/domain/booking/time';
import { handleTurn, type TurnDecision } from '@/domain/conversation/engine';
import { createSession } from '@/domain/conversation/session';
import { AppError } from '@/domain/errors';
import { classifyGuardrail } from '@/domain/guardrails/policy';
import { LISTINGS } from '@/domain/listings/data';
import { pipelineStage, qualificationScore } from '@/domain/qualification/score';
import { mergeSlots } from '@/domain/qualification/slots';
import type {
  Channel,
  Conversation,
  Lead,
  ReplyMode,
  Session,
  StoredMessage,
} from '@/domain/types';

import { getContainer } from './container';
import { MAX_MESSAGE_CHARS, MAX_TURNS, tooLongMessage, turnLimitMessage } from './limits';

export type InboundResult = {
  reply: string;
  mode: ReplyMode;
  conversationId: string;
  leadId: string;
  stage: Conversation['session']['stage'];
  slots: Conversation['session']['slots'];
  score: number;
  listings: {
    id: string;
    address: string;
    neighborhood: string;
    beds: number;
    type: string;
    price: number;
  }[];
  appointment: { id: string; start: string; label: string } | null;
  transcript: StoredMessage[];
  guardrail?: string;
};

export async function acceptInbound(input: {
  channel: Exclude<Channel, 'voice'>;
  externalUserId: string;
  externalMessageId: string;
  text: string;
  conversationId?: string;
  now?: Date;
  requestId: string;
}): Promise<InboundResult> {
  const container = getContainer();
  await container.ready;
  const now = input.now ?? new Date();
  const started = performance.now();
  const existing = input.conversationId
    ? await container.repo.getConversation(input.conversationId)
    : await container.repo.findConversation(input.channel, input.externalUserId);
  if (input.conversationId && !existing) {
    throw new AppError('not_found', 'Conversation not found', 404);
  }

  const conversation = existing ?? newConversation(input.channel, input.externalUserId, now);
  const limited = limitTurn(conversation.session, input.text);
  if (limited) {
    return persistTurn(
      input,
      conversation,
      limited.session,
      limited.reply,
      'offline',
      started,
      now,
      'limit',
    );
  }

  const policy = policyTurn(input.channel, input.text, conversation.session);
  let session = conversation.session;
  let text = input.text;
  let mode: ReplyMode = 'offline';
  let modelText: string | null = null;
  if (container.relay && !policy) {
    try {
      const history = await container.repo.listMessages(conversation.id);
      const live = await qualifyWithRelay(container.relay, {
        text: input.text,
        slots: conversation.session.slots,
        history,
      });
      session = {
        ...conversation.session,
        slots: mergeSlots(conversation.session.slots, live.slots),
      };
      if (live.book && !hasBookingIntent(input.text))
        text = `${input.text}\nBook the earliest slot`;
      modelText = live.reply;
    } catch (error) {
      if (!isRelayFallback(error)) throw error;
      mode = 'offline_fallback';
      container.logger.warn('llm.fallback', {
        requestId: input.requestId,
        conversationId: conversation.id,
        reason: error instanceof Error ? error.name : 'Error',
      });
    }
  }

  const decision = await handleTurn({
    session,
    text,
    now,
    calendar: container.calendar,
    listings: LISTINGS,
    timeZone: container.timeZone,
  });
  const reply = chooseReply(decision, modelText, input.text, mode, container.timeZone);
  if (modelText && reply !== decision.reply && mode !== 'offline_fallback') mode = 'relay';
  if (
    modelText &&
    reply === decision.reply &&
    mode !== 'offline_fallback' &&
    decision.allowRephrase
  ) {
    mode = 'offline_fallback';
  }
  if (!container.relay && decision.allowRephrase && container.model.id === 'openai') {
    const facts = replyFacts(decision.reply);
    try {
      const rewritten = await container.model.rephrase({ draft: decision.reply, facts });
      return persistTurn(
        input,
        conversation,
        decision.session,
        rewritten,
        'openai',
        started,
        now,
        decision.kind,
        decision,
      );
    } catch (error) {
      mode = 'offline_fallback';
      container.logger.warn('llm.fallback', {
        requestId: input.requestId,
        conversationId: conversation.id,
        reason: error instanceof Error ? error.name : 'Error',
      });
    }
  }

  return persistTurn(
    input,
    conversation,
    decision.session,
    reply,
    mode,
    started,
    now,
    decision.kind,
    decision,
  );
}

async function persistTurn(
  input: {
    channel: Exclude<Channel, 'voice'>;
    externalMessageId: string;
    text: string;
    requestId: string;
  },
  conversation: Conversation,
  session: Session,
  reply: string,
  mode: ReplyMode,
  started: number,
  now: Date,
  kind: string,
  decision?: TurnDecision,
): Promise<InboundResult> {
  const container = getContainer();
  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  const createdAt = now.toISOString();
  const assistantAt = new Date(now.getTime() + 1).toISOString();
  const userMessage: StoredMessage = {
    id: `${input.externalMessageId}:user`,
    conversationId: conversation.id,
    role: 'user',
    text: input.text,
    channel: input.channel,
    createdAt,
  };
  const assistantMessage: StoredMessage = {
    id: `${input.externalMessageId}:assistant`,
    conversationId: conversation.id,
    role: 'assistant',
    text: reply,
    channel: input.channel,
    createdAt: assistantAt,
    mode,
    latencyMs,
  };
  await container.repo.addMessage(userMessage);
  await container.repo.addMessage(assistantMessage);
  await container.repo.addLatency({
    id: `${input.externalMessageId}:latency`,
    channel: input.channel,
    conversationId: conversation.id,
    latencyMs,
    createdAt,
  });

  const updated: Conversation = {
    ...conversation,
    session,
    updatedAt: createdAt,
  };
  await container.repo.upsertConversation(updated);
  await container.repo.upsertLead(toLead(updated, now));
  for (const appointment of await container.calendar.listAppointments()) {
    await container.repo.upsertAppointment(appointment);
  }

  container.logger.info('turn.completed', {
    requestId: input.requestId,
    channel: input.channel,
    conversationId: conversation.id,
    mode,
    latencyMs,
    kind,
  });

  const appointment = decision?.appointment;
  return {
    reply,
    mode,
    conversationId: conversation.id,
    leadId: updated.leadId,
    stage: session.stage,
    slots: session.slots,
    score: qualificationScore(session.slots),
    listings: (decision?.listings ?? []).map((listing) => ({
      id: listing.id,
      address: listing.address,
      neighborhood: listing.neighborhood,
      beds: listing.beds,
      type: listing.type,
      price: listing.price,
    })),
    appointment: appointment
      ? {
          id: appointment.id,
          start: appointment.start,
          label: formatWhen(appointment.start, container.timeZone),
        }
      : null,
    transcript: await container.repo.listMessages(conversation.id),
    guardrail: decision?.guardrail,
  };
}

function limitTurn(session: Session, text: string): { session: Session; reply: string } | null {
  if (text.length > MAX_MESSAGE_CHARS) {
    return {
      reply: tooLongMessage(),
      session: { ...session, turnCount: session.turnCount + 1 },
    };
  }
  if (session.turnCount >= MAX_TURNS) {
    return {
      reply: turnLimitMessage(),
      session: { ...session, turnCount: session.turnCount + 1, handoff: true, stage: 'handoff' },
    };
  }
  return null;
}

function policyTurn(channel: Exclude<Channel, 'voice'>, text: string, session: Session): boolean {
  const trimmed = text.trim();
  if (channel === 'sms' && (isStopKeyword(trimmed) || session.optedOut)) return true;
  if (classifyGuardrail(trimmed)) return true;
  if (wantsHuman(trimmed) || session.handoff) return true;
  return false;
}

function chooseReply(
  decision: TurnDecision,
  modelText: string | null,
  userText: string,
  mode: ReplyMode,
  timeZone: string,
): string {
  if (
    !modelText ||
    mode === 'offline_fallback' ||
    !decision.allowRephrase ||
    !replyLooksUsable(modelText, userText)
  ) {
    return decision.reply;
  }
  if (!decision.appointment) return modelText;
  const label = formatWhen(decision.appointment.start, timeZone);
  if (modelText.includes(label)) return modelText;
  return `${modelText.trim()} Tour booked for ${label}.`;
}

function newConversation(
  channel: Exclude<Channel, 'voice'>,
  externalUserId: string,
  now: Date,
): Conversation {
  const id = crypto.randomUUID();
  const leadId = crypto.randomUUID();
  return {
    id,
    leadId,
    channel,
    externalUserId,
    session: createSession({ id, leadId, channel }),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function toLead(conversation: Conversation, now: Date): Lead {
  const session = conversation.session;
  return {
    id: conversation.leadId,
    channel: conversation.channel,
    externalUserId: conversation.externalUserId,
    score: qualificationScore(session.slots),
    stage: pipelineStage({
      optedOut: session.optedOut,
      handoff: session.handoff,
      appointmentId: session.appointmentId,
      slots: session.slots,
      turnCount: session.turnCount,
    }),
    slots: session.slots,
    appointmentId: session.appointmentId,
    conversationId: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: now.toISOString(),
  };
}

function replyFacts(draft: string): string[] {
  const facts: string[] = [];
  for (const match of draft.matchAll(/\$\d[\d,]*/g)) {
    if (match[0]) facts.push(match[0]);
  }
  if (draft.toLowerCase().includes('booked')) facts.push('booked');
  if (draft.toLowerCase().includes('weekdays')) facts.push('weekdays');
  return facts.slice(0, 8);
}
