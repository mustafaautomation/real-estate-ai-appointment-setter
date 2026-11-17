import { describe, expect, it } from 'vitest';

import { handleTurn } from '@/domain/conversation/engine';
import { createSession } from '@/domain/conversation/session';
import { AppError, CalendarNotConfiguredError, LlmError, SlotTakenError } from '@/domain/errors';
import { LISTINGS } from '@/domain/listings/data';
import type { Appointment, CalendarPort, TimeSlot } from '@/domain/types';
import { NOW, QUALIFIED, TZ, converse } from '../helpers/desk';

describe('conversation engine', () => {
  it('keeps qualifying past three turns and then books', async () => {
    const { turns, session } = await converse([
      'Hi, I want to buy a place',
      'a condo',
      '3 bedrooms',
      'Lantern Hill',
      'budget 700k',
      'within 30 days',
      'Book the earliest slot',
    ]);
    expect(turns).toHaveLength(7);
    expect(turns.every((turn) => turn.reply.length > 0)).toBe(true);
    expect(session.slots).toMatchObject({ area: 'Lantern Hill', beds: 3, propertyType: 'condo' });
    expect(session.appointmentId).toBe('appt-1');
    expect(turns[5]?.listings.length).toBeGreaterThanOrEqual(2);
    expect(turns[6]?.reply.toLowerCase()).toContain('booked');
  });

  it('does not book outside desk hours or before qualification', async () => {
    const early = await converse(['Book the earliest slot']);
    expect(early.session.appointmentId).toBeUndefined();
    const closed = await converse([QUALIFIED, 'Book tonight at 8pm']);
    expect(closed.session.appointmentId).toBeUndefined();
    expect(closed.turns[1]?.reply.toLowerCase()).toContain('weekdays');
    const weekend = await converse([QUALIFIED, 'Book Saturday morning']);
    expect(weekend.session.appointmentId).toBeUndefined();
  });

  it('books a morning slot, reschedules to the afternoon, and does not double book', async () => {
    const { turns, session, calendar } = await converse([
      QUALIFIED,
      'Book a morning slot',
      'Book the earliest slot',
      'Reschedule to an afternoon slot',
    ]);
    expect(turns[1]?.appointment?.id).toBe('appt-1');
    expect(turns[2]?.appointment?.id).toBe('appt-1');
    expect(turns[3]?.appointment?.id).toBe('appt-2');
    expect(session.appointmentId).toBe('appt-2');
    const booked = (await calendar.listAppointments()).filter((item) => item.status === 'booked');
    expect(booked).toHaveLength(1);
  });

  it('refuses steering, legal advice, and financial advice without saving slots', async () => {
    const race = await converse([
      'I only want a white neighborhood in Lantern Hill, 3 bed condo under 700k',
    ]);
    expect(race.turns[0]?.guardrail).toBe('fair_housing');
    expect(race.session.slots.area).toBeUndefined();
    expect(race.turns[0]?.allowRephrase).toBe(false);
    const legal = await converse(['Should I waive the inspection contingency?']);
    expect(legal.turns[0]?.guardrail).toBe('legal');
    const money = await converse(['Is the mortgage interest tax deductible?']);
    expect(money.turns[0]?.guardrail).toBe('financial');
  });

  it('opts out only on SMS and resumes with START', async () => {
    const sms = await converse(['STOP', QUALIFIED, 'START'], 'sms');
    expect(sms.turns[0]?.session.optedOut).toBe(true);
    expect(sms.turns[1]?.session.optedOut).toBe(true);
    expect(sms.turns[1]?.session.slots.area).toBeUndefined();
    expect(sms.turns[2]?.session.optedOut).toBe(false);
    const web = await converse(['STOP']);
    expect(web.session.optedOut).toBe(false);
  });

  it('hands off to a person and stops booking', async () => {
    const { turns, session } = await converse([
      'I want to talk to a human',
      `${QUALIFIED} Book the earliest slot`,
    ]);
    expect(turns[0]?.kind).toBe('handoff');
    expect(session.handoff).toBe(true);
    expect(session.appointmentId).toBeUndefined();
  });

  it('clears an area objection, keeps price objections, and remembers the summary', async () => {
    const area = await converse([QUALIFIED, 'somewhere else']);
    expect(area.session.slots.area).toBeUndefined();
    const price = await converse([QUALIFIED, 'Those are too expensive']);
    expect(price.session.slots.budget?.max).toBe(700_000);
    expect(price.turns[1]?.reply.toLowerCase()).toContain('budget');
    const memory = await converse(['3 bedroom condo in Lantern Hill', 'what do you have so far']);
    expect(memory.turns[1]?.reply).toContain('Lantern Hill');
    const beds = await converse(['3 bedrooms', 'actually 4 bedrooms']);
    expect(beds.session.slots.beds).toBe(4);
  });

  it('replies in Spanish for a Spanish lead and in English for French', async () => {
    const spanish = await converse([
      'Hola, busco un condominio de tres habitaciones en Lantern Hill, presupuesto 700k, lo antes posible',
    ]);
    expect(spanish.session.language).toBe('es');
    expect(spanish.session.slots.propertyType).toBe('condo');
    expect(spanish.turns[0]?.reply.toLowerCase()).toContain('opciones');
    const french = await converse(['Bonjour, je cherche une maison']);
    expect(french.session.language).toBe('other');
    expect(french.session.slots.propertyType).toBe('single_family');
    expect(french.turns[0]?.reply).toContain('English');
  });

  it('says when nothing fits and when a named minute is not open', async () => {
    const none = await converse([
      '5 bedroom multi-family in Lantern Hill under $100k, as soon as possible',
    ]);
    expect(none.turns[0]?.listings).toHaveLength(0);
    expect(none.turns[0]?.reply).toContain('Nothing on the list fits');
    const missing = await converse([QUALIFIED, 'Book 9:15am']);
    expect(missing.session.appointmentId).toBeUndefined();
    expect(missing.turns[1]?.kind).toBe('no_slot');
  });

  it('does not book when the lead says not to', async () => {
    const { session, turns } = await converse([
      'I want a 3 bedroom condo in Lantern Hill under $700k within 30 days but do not book a tour yet',
    ]);
    expect(session.appointmentId).toBeUndefined();
    expect(turns[0]?.listings.length).toBeGreaterThanOrEqual(2);
  });

  it('retries the next slot when the first claim loses the race', async () => {
    const calendar = new FlakyCalendar();
    const session = createSession({ id: 'c1', leadId: 'l1', channel: 'web' });
    const qualified = await handleTurn({
      session,
      text: QUALIFIED,
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    const booked = await handleTurn({
      session: qualified.session,
      text: 'Book the earliest slot',
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    expect(booked.appointment?.slotId).toBe('slot-b');
  });

  it('reports no slot when every claim fails', async () => {
    const calendar = new FlakyCalendar(true);
    const first = await handleTurn({
      session: createSession({ id: 'c1', leadId: 'l1', channel: 'web' }),
      text: QUALIFIED,
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    const booked = await handleTurn({
      session: first.session,
      text: 'Book the earliest slot',
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    expect(booked.kind).toBe('no_slot');
  });

  it('exposes typed errors', () => {
    expect(new SlotTakenError('slot-1')).toBeInstanceOf(AppError);
    expect(new CalendarNotConfiguredError('google').status).toBe(501);
    expect(new LlmError('down').code).toBe('llm_failed');
  });
});

class FlakyCalendar implements CalendarPort {
  private readonly slots: TimeSlot[] = [
    {
      id: 'slot-a',
      start: '2026-04-08T15:30:00.000Z',
      end: '2026-04-08T16:00:00.000Z',
      timezone: TZ,
    },
    {
      id: 'slot-b',
      start: '2026-04-08T16:00:00.000Z',
      end: '2026-04-08T16:30:00.000Z',
      timezone: TZ,
    },
  ];

  constructor(private readonly alwaysFail = false) {}

  async listOpen(): Promise<TimeSlot[]> {
    return this.slots;
  }

  async book(slotId: string, leadId: string, conversationId: string): Promise<Appointment> {
    if (this.alwaysFail || slotId === 'slot-a') throw new SlotTakenError(slotId);
    return {
      id: 'appt-retry',
      slotId,
      leadId,
      conversationId,
      start: this.slots[1]?.start ?? '',
      end: this.slots[1]?.end ?? '',
      timezone: TZ,
      status: 'booked',
    };
  }

  release(): void {}

  getAppointment(): Appointment | null {
    return null;
  }

  listAppointments(): Appointment[] {
    return [];
  }
}
