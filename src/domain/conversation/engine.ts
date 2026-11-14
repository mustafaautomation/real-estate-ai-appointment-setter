import { chooseSlot } from '../booking/choose';
import {
  detectObjection,
  hasBookingIntent,
  hasRescheduleIntent,
  interpretSchedule,
  isStartKeyword,
  isStopKeyword,
  wantsHuman,
  wantsSummary,
} from '../booking/schedule';
import { SlotTakenError } from '../errors';
import { classifyGuardrail } from '../guardrails/policy';
import { detectLanguage } from '../language/detect';
import { matchListings } from '../matching/match';
import { extractSlots } from '../qualification/extract';
import { isQualified, mergeSlots } from '../qualification/slots';
import type {
  Appointment,
  CalendarPort,
  GuardrailKind,
  Listing,
  SchedulePreference,
  Session,
  Slots,
  TimeSlot,
} from '../types';
import { composeReply, type ReplyKind } from './replies';

export type TurnDecision = {
  session: Session;
  reply: string;
  kind: ReplyKind;
  listings: Listing[];
  appointment?: Appointment;
  guardrail?: GuardrailKind;
  allowRephrase: boolean;
};

export async function handleTurn(input: {
  session: Session;
  text: string;
  now: Date;
  calendar: CalendarPort;
  listings: readonly Listing[];
  timeZone: string;
}): Promise<TurnDecision> {
  const session = cloneSession(input.session);
  session.turnCount += 1;
  session.language = detectLanguage(input.text);
  const text = input.text.trim();

  if (session.channel === 'sms' && isStopKeyword(text)) {
    session.optedOut = true;
    session.stage = 'opted_out';
    return decide(session, 'opt_out_confirm', input, { allowRephrase: false });
  }

  if (session.optedOut) {
    if (session.channel === 'sms' && isStartKeyword(text)) {
      session.optedOut = false;
      session.stage = 'collecting';
      return decide(session, 'opt_in', input, { allowRephrase: false });
    }
    session.stage = 'opted_out';
    return decide(session, 'opt_out_hold', input, { allowRephrase: false });
  }

  const guardrail = classifyGuardrail(text);
  if (guardrail) {
    session.lastGuardrail = guardrail;
    if (session.stage === 'greeting') session.stage = 'collecting';
    return decide(session, 'guardrail', input, { guardrail, allowRephrase: false });
  }

  if (wantsHuman(text)) {
    session.handoff = true;
    session.stage = 'handoff';
    return decide(session, 'handoff', input, { allowRephrase: false });
  }

  if (session.handoff) {
    session.stage = 'handoff';
    return decide(session, 'handoff_hold', input, { allowRephrase: false });
  }

  session.slots = mergeSlots(session.slots, extractSlots(text));
  const objection = detectObjection(text);
  if (objection === 'area') session.slots = without(session.slots, 'area');
  if (objection === 'size') session.slots = without(session.slots, 'beds');

  const booking = hasBookingIntent(text);
  const reschedule = hasRescheduleIntent(text);

  if ((booking || reschedule) && !isQualified(session.slots)) {
    session.stage = 'collecting';
    return decide(session, 'need_slots', input, { allowRephrase: true });
  }

  if (booking && session.appointmentId && !reschedule) {
    session.stage = 'booked';
    const existing = input.calendar.getAppointment(session.appointmentId) ?? undefined;
    const listings = matched(input.listings, session);
    return decide(session, 'booked', input, {
      allowRephrase: true,
      appointment: existing?.status === 'booked' ? existing : undefined,
      listings,
    });
  }

  if (booking || reschedule) {
    return bookFromText(session, text, input, reschedule);
  }

  if (wantsSummary(text)) {
    session.stage = isQualified(session.slots) ? 'matching' : 'collecting';
    const listings = isQualified(session.slots) ? matched(input.listings, session) : [];
    return decide(session, 'summary', input, { allowRephrase: true, listings });
  }

  if (objection === 'price' && isQualified(session.slots)) {
    session.stage = 'matching';
    return decide(session, 'objection_price', input, {
      allowRephrase: true,
      listings: matched(input.listings, session),
    });
  }

  if (isQualified(session.slots)) {
    const listings = matched(input.listings, session);
    session.stage = 'matching';
    session.listingIds = listings.map((listing) => listing.id);
    if (listings.length === 0)
      return decide(session, 'no_match', input, { allowRephrase: true, listings });
    return decide(session, 'listings', input, { allowRephrase: true, listings });
  }

  session.stage = 'collecting';
  session.listingIds = [];
  return decide(session, 'need_slots', input, { allowRephrase: true });
}

async function bookFromText(
  session: Session,
  text: string,
  input: {
    now: Date;
    calendar: CalendarPort;
    listings: readonly Listing[];
    timeZone: string;
  },
  reschedule: boolean,
): Promise<TurnDecision> {
  const preference = interpretSchedule(text);
  const open = await input.calendar.listOpen(input.now);
  const current = session.appointmentId
    ? input.calendar.getAppointment(session.appointmentId)
    : null;
  const after = reschedule && current ? current.start : undefined;

  if (preference.kind === 'out_of_hours') {
    session.stage = 'scheduling';
    const next = chooseSlot(open, { kind: 'earliest' }, input.timeZone);
    return decide(session, 'out_of_hours', input, {
      allowRephrase: true,
      nextSlot: typeof next === 'object' ? next : undefined,
      listings: matched(input.listings, session),
    });
  }

  const chosen = chooseSlot(open, preference, input.timeZone, after);
  if (chosen === 'none' || chosen === 'out_of_hours') {
    session.stage = 'scheduling';
    return decide(session, 'no_slot', input, {
      allowRephrase: true,
      listings: matched(input.listings, session),
    });
  }

  const appointment = await bookSlot(
    input.calendar,
    chosen,
    session,
    open,
    preference,
    input.timeZone,
    after,
  );
  if (!appointment) {
    session.stage = 'scheduling';
    return decide(session, 'no_slot', input, {
      allowRephrase: true,
      listings: matched(input.listings, session),
    });
  }

  if (current && current.status === 'booked') input.calendar.release(current.id);
  session.appointmentId = appointment.id;
  session.stage = 'booked';
  const listings = matched(input.listings, session);
  session.listingIds = listings.map((listing) => listing.id);
  return decide(session, reschedule ? 'rescheduled' : 'booked', input, {
    allowRephrase: true,
    appointment,
    listings,
  });
}

async function bookSlot(
  calendar: CalendarPort,
  chosen: TimeSlot,
  session: Session,
  open: readonly TimeSlot[],
  preference: SchedulePreference,
  timeZone: string,
  after?: string,
): Promise<Appointment | null> {
  try {
    return await calendar.book(chosen.id, session.leadId, session.id);
  } catch (error) {
    if (!(error instanceof SlotTakenError)) throw error;
    const retryPool = open.filter((slot) => slot.id !== chosen.id);
    const retry = chooseSlot(retryPool, preference, timeZone, after);
    if (typeof retry !== 'object') return null;
    try {
      return await calendar.book(retry.id, session.leadId, session.id);
    } catch (retryError) {
      if (retryError instanceof SlotTakenError) return null;
      throw retryError;
    }
  }
}

function matched(listings: readonly Listing[], session: Session): Listing[] {
  if (!isQualified(session.slots)) return [];
  return matchListings(listings, session.slots);
}

function without(slots: Slots, key: 'area' | 'beds'): Slots {
  const next: Slots = { ...slots };
  if (key === 'area') delete next.area;
  if (key === 'beds') delete next.beds;
  return next;
}

function cloneSession(session: Session): Session {
  return {
    ...session,
    slots: {
      ...session.slots,
      ...(session.slots.budget ? { budget: { ...session.slots.budget } } : {}),
    },
    listingIds: [...session.listingIds],
  };
}

function decide(
  session: Session,
  kind: ReplyKind,
  input: { listings: readonly Listing[]; timeZone: string },
  extras: {
    allowRephrase: boolean;
    guardrail?: GuardrailKind;
    listings?: Listing[];
    appointment?: Appointment;
    nextSlot?: TimeSlot;
  },
): TurnDecision {
  const listings = extras.listings ?? [];
  const reply = composeReply({
    session,
    kind,
    listings,
    appointment: extras.appointment,
    nextSlot: extras.nextSlot,
    guardrail: extras.guardrail,
    timeZone: input.timeZone,
  });
  return {
    session,
    reply,
    kind,
    listings,
    appointment: extras.appointment,
    guardrail: extras.guardrail,
    allowRephrase: extras.allowRephrase,
  };
}
