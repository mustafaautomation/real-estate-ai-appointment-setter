import { formatWhen } from '@/domain/booking/time';
import { handleTurn } from '@/domain/conversation/engine';
import { createSession } from '@/domain/conversation/session';
import { AppError } from '@/domain/errors';
import { LISTINGS } from '@/domain/listings/data';
import { pipelineStage, qualificationScore } from '@/domain/qualification/score';
import type { Channel, Conversation, Lead, ReplyMode, StoredMessage } from '@/domain/types';

import { getContainer } from './container';

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
  const now = input.now ?? new Date();
  const started = performance.now();
  const existing = input.conversationId
    ? container.repo.getConversation(input.conversationId)
    : container.repo.findConversation(input.channel, input.externalUserId);
  if (input.conversationId && !existing) {
    throw new AppError('not_found', 'Conversation not found', 404);
  }

  const conversation = existing ?? newConversation(input.channel, input.externalUserId, now);
  const decision = await handleTurn({
    session: conversation.session,
    text: input.text,
    now,
    calendar: container.calendar,
    listings: LISTINGS,
    timeZone: container.timeZone,
  });

  let reply = decision.reply;
  let mode: ReplyMode = 'offline';
  if (decision.allowRephrase && container.model.id === 'openai') {
    const facts = replyFacts(decision.reply);
    try {
      reply = await container.model.rephrase({ draft: decision.reply, facts });
      mode = 'openai';
    } catch (error) {
      mode = 'offline_fallback';
      container.logger.warn('llm.fallback', {
        requestId: input.requestId,
        conversationId: conversation.id,
        reason: error instanceof Error ? error.name : 'Error',
      });
    }
  }

  const latencyMs = Math.max(0, Math.round(performance.now() - started));
  const createdAt = now.toISOString();
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
    createdAt,
    mode,
    latencyMs,
  };
  container.repo.addMessage(userMessage);
  container.repo.addMessage(assistantMessage);
  container.repo.addLatency({
    id: `${input.externalMessageId}:latency`,
    channel: input.channel,
    conversationId: conversation.id,
    latencyMs,
    createdAt,
  });

  const updated: Conversation = {
    ...conversation,
    session: decision.session,
    updatedAt: createdAt,
  };
  container.repo.upsertConversation(updated);
  container.repo.upsertLead(toLead(updated, now));
  for (const appointment of container.calendar.listAppointments()) {
    container.repo.upsertAppointment(appointment);
  }

  container.logger.info('turn.completed', {
    requestId: input.requestId,
    channel: input.channel,
    conversationId: conversation.id,
    mode,
    latencyMs,
    kind: decision.kind,
  });

  const appointment = decision.appointment;
  return {
    reply,
    mode,
    conversationId: conversation.id,
    leadId: updated.leadId,
    stage: decision.session.stage,
    slots: decision.session.slots,
    score: qualificationScore(decision.session.slots),
    listings: decision.listings.map((listing) => ({
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
    transcript: container.repo.listMessages(conversation.id),
    guardrail: decision.guardrail,
  };
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
