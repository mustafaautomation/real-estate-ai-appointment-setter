import { readFileSync } from 'node:fs';

import { parse } from 'yaml';

import { createReplyModel } from '../src/adapters/llm/model';
import { handleTurn, type TurnDecision } from '../src/domain/conversation/engine';
import { createSession } from '../src/domain/conversation/session';
import { LISTINGS } from '../src/domain/listings/data';
import { missingSlots } from '../src/domain/qualification/slots';
import { qualificationScore } from '../src/domain/qualification/score';
import { MemoryCalendar } from '../src/domain/booking/memory-calendar';
import type { Channel, Session } from '../src/domain/types';

type SlotExpect = {
  propertyType?: string | null;
  beds?: number | null;
  area?: string | null;
  budgetMax?: number | null;
  budgetMin?: number | null;
  timeline?: string | null;
};

type Expectation = {
  stage?: string;
  slots?: SlotExpect;
  qualified?: boolean;
  listings_min?: number;
  listings_max?: number;
  booked?: boolean;
  guardrail?: string | null;
  handoff?: boolean;
  opted_out?: boolean;
  language?: string;
  reply_matches?: string;
  rescheduled?: boolean;
  same_appointment?: boolean;
  score_min?: number;
  min_replies?: number;
};

type Scenario = {
  id: string;
  channel: Channel;
  turns: { user: string; expect?: Expectation }[];
  expect?: Expectation;
};

const NOW = new Date('2026-04-08T15:00:00.000Z');
const TZ = 'America/Chicago';
const THRESHOLD = Number(process.env.EVAL_THRESHOLD ?? 1);

async function main() {
  if (process.env.EVAL_PROVIDER === 'openai' && !process.env.OPENAI_API_KEY) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'OPENAI_API_KEY not set' }));
    process.exit(0);
  }
  const scenarios = parse(
    readFileSync(new URL('./suite.yaml', import.meta.url), 'utf8'),
  ) as Scenario[];
  const provider = process.env.EVAL_PROVIDER === 'openai' ? 'openai' : 'offline';
  const model = provider === 'openai' ? createReplyModel() : null;
  if (provider === 'openai' && model?.id !== 'openai') {
    console.log(JSON.stringify({ status: 'skipped', reason: 'OpenAI model was not constructed' }));
    process.exit(0);
  }
  let passed = 0;
  let openaiReplies = 0;
  const failures: string[] = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario, model);
    openaiReplies += result.openaiReplies;
    if (result.problems.length === 0) {
      passed += 1;
      console.log(`PASS ${scenario.id}`);
    } else {
      failures.push(`${scenario.id}: ${result.problems.join('; ')}`);
      console.log(`FAIL ${scenario.id}`);
      for (const problem of result.problems) console.log(`  - ${problem}`);
    }
  }
  const rate = scenarios.length === 0 ? 0 : passed / scenarios.length;
  console.log(
    JSON.stringify({
      passed,
      total: scenarios.length,
      rate,
      threshold: THRESHOLD,
      openaiReplies,
      provider,
    }),
  );
  if (provider === 'openai' && openaiReplies === 0) {
    console.error('OpenAI eval completed without a model call');
    process.exit(1);
  }
  if (rate < THRESHOLD) process.exit(1);
}

async function runScenario(
  scenario: Scenario,
  model: ReturnType<typeof createReplyModel> | null,
): Promise<{ problems: string[]; openaiReplies: number }> {
  const calendar = new MemoryCalendar(NOW, TZ);
  let session = createSession({
    id: scenario.id,
    leadId: `${scenario.id}-lead`,
    channel: scenario.channel,
  });
  const problems: string[] = [];
  let replies = 0;
  let openaiReplies = 0;
  let previousAppointment: string | undefined;
  for (const [index, turn] of scenario.turns.entries()) {
    let decision = await handleTurn({
      session,
      text: turn.user,
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    if (model && decision.allowRephrase) {
      const reply = await model.rephrase({ draft: decision.reply, facts: [] });
      decision = { ...decision, reply };
      openaiReplies += 1;
    }
    session = decision.session;
    replies += 1;
    const expectation = model
      ? { ...(turn.expect ?? {}), reply_matches: undefined }
      : (turn.expect ?? {});
    problems.push(
      ...check(decision, session, expectation, previousAppointment).map(
        (problem) => `turn ${index + 1}: ${problem}`,
      ),
    );
    previousAppointment = session.appointmentId;
  }
  problems.push(...checkFinal(session, replies, scenario.expect ?? {}));
  return { problems, openaiReplies };
}

function check(
  decision: TurnDecision,
  session: Session,
  expect: Expectation,
  previous: string | undefined,
): string[] {
  const problems: string[] = [];
  if (!decision.reply.trim()) problems.push('empty reply');
  if (expect.stage && session.stage !== expect.stage)
    problems.push(`stage ${session.stage} != ${expect.stage}`);
  if (
    expect.qualified !== undefined &&
    (missingSlots(session.slots).length === 0) !== expect.qualified
  ) {
    problems.push(`qualified ${missingSlots(session.slots).length === 0}`);
  }
  if (expect.listings_min !== undefined && decision.listings.length < expect.listings_min) {
    problems.push(`listings ${decision.listings.length} < ${expect.listings_min}`);
  }
  if (expect.listings_max !== undefined && decision.listings.length > expect.listings_max) {
    problems.push(`listings ${decision.listings.length} > ${expect.listings_max}`);
  }
  if (expect.booked !== undefined && Boolean(session.appointmentId) !== expect.booked) {
    problems.push(`booked ${Boolean(session.appointmentId)}`);
  }
  if (expect.guardrail !== undefined && (decision.guardrail ?? null) !== expect.guardrail) {
    problems.push(`guardrail ${decision.guardrail ?? 'none'}`);
  }
  if (expect.handoff !== undefined && session.handoff !== expect.handoff)
    problems.push(`handoff ${session.handoff}`);
  if (expect.opted_out !== undefined && session.optedOut !== expect.opted_out)
    problems.push(`opted_out ${session.optedOut}`);
  if (expect.language && session.language !== expect.language)
    problems.push(`language ${session.language}`);
  if (expect.reply_matches && !new RegExp(expect.reply_matches, 'i').test(decision.reply)) {
    problems.push(`reply did not match /${expect.reply_matches}/ :: ${decision.reply}`);
  }
  if (expect.score_min !== undefined && qualificationScore(session.slots) < expect.score_min) {
    problems.push(`score ${qualificationScore(session.slots)}`);
  }
  if (expect.rescheduled && session.appointmentId === previous)
    problems.push('appointment id did not change');
  if (expect.same_appointment && session.appointmentId !== previous)
    problems.push('appointment id changed');
  if (expect.slots) problems.push(...checkSlots(session, expect.slots));
  return problems;
}

function checkFinal(session: Session, replies: number, expect: Expectation): string[] {
  const problems: string[] = [];
  if (expect.min_replies !== undefined && replies < expect.min_replies) {
    problems.push(`replies ${replies} < ${expect.min_replies}`);
  }
  const rest: Expectation = {};
  if (expect.booked !== undefined) rest.booked = expect.booked;
  if (expect.opted_out !== undefined) rest.opted_out = expect.opted_out;
  if (expect.handoff !== undefined) rest.handoff = expect.handoff;
  if (expect.qualified !== undefined) rest.qualified = expect.qualified;
  if (expect.language) rest.language = expect.language;
  if (expect.score_min !== undefined) rest.score_min = expect.score_min;
  if (expect.slots) rest.slots = expect.slots;
  problems.push(
    ...check(
      { session, reply: 'final', kind: 'summary', listings: [], allowRephrase: false },
      session,
      rest,
      session.appointmentId,
    ).filter((problem) => problem !== 'empty reply'),
  );
  return problems;
}

function checkSlots(session: Session, slots: SlotExpect): string[] {
  const problems: string[] = [];
  const actual = session.slots;
  if ('area' in slots && (actual.area ?? null) !== slots.area)
    problems.push(`area ${actual.area ?? 'none'}`);
  if ('beds' in slots && (actual.beds ?? null) !== slots.beds)
    problems.push(`beds ${actual.beds ?? 'none'}`);
  if ('propertyType' in slots && (actual.propertyType ?? null) !== slots.propertyType) {
    problems.push(`type ${actual.propertyType ?? 'none'}`);
  }
  if ('timeline' in slots && (actual.timeline ?? null) !== slots.timeline)
    problems.push(`timeline ${actual.timeline ?? 'none'}`);
  if ('budgetMax' in slots && (actual.budget?.max ?? null) !== slots.budgetMax) {
    problems.push(`budgetMax ${actual.budget?.max ?? 'none'}`);
  }
  if ('budgetMin' in slots && (actual.budget?.min ?? null) !== slots.budgetMin) {
    problems.push(`budgetMin ${actual.budget?.min ?? 'none'}`);
  }
  return problems;
}

void main();
