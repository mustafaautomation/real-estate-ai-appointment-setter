import { describe, expect, it } from 'vitest';

import { chooseSlot } from '@/domain/booking/choose';
import { MemoryCalendar } from '@/domain/booking/memory-calendar';
import { generateSlots } from '@/domain/booking/slots';
import { addCivilDays, zonedLocalToUtc, zonedParts } from '@/domain/booking/time';
import { SlotTakenError } from '@/domain/errors';
import { NOW, TZ } from '../helpers/desk';

describe('timezone conversion', () => {
  it('converts Chicago civil time across DST', () => {
    const summer = zonedLocalToUtc({ year: 2026, month: 7, day: 15, hour: 9, minute: 0 }, TZ);
    expect(summer.status).toBe('ok');
    expect(summer.utc?.toISOString()).toBe('2026-07-15T14:00:00.000Z');

    const winter = zonedLocalToUtc({ year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, TZ);
    expect(winter.status).toBe('ok');
    expect(winter.utc?.toISOString()).toBe('2026-01-15T15:00:00.000Z');
  });

  it('rejects the spring-forward gap and flags the fall-back hour', () => {
    const gap = zonedLocalToUtc({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, TZ);
    expect(gap.status).toBe('gap');
    const fold = zonedLocalToUtc({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 }, TZ);
    expect(fold.status).toBe('ambiguous');
    expect(fold.utc).toBeInstanceOf(Date);
  });

  it('generates weekday desk hours only', () => {
    const slots = generateSlots(NOW, TZ, 5);
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      const parts = zonedParts(new Date(slot.start), TZ);
      expect(parts.weekday).toBeGreaterThanOrEqual(1);
      expect(parts.weekday).toBeLessThanOrEqual(5);
      expect(parts.hour).toBeGreaterThanOrEqual(9);
      expect(parts.hour).toBeLessThan(17);
      expect(new Date(slot.start).getTime()).toBeGreaterThan(NOW.getTime());
    }
    const shifted = addCivilDays(NOW, TZ, 1);
    expect(shifted.day).toBe(9);
  });
});

describe('memory calendar', () => {
  it('books one slot and rejects the second caller', async () => {
    const calendar = new MemoryCalendar(NOW, TZ, () => 'appt-1');
    const [slot] = await calendar.listOpen(NOW);
    expect(slot).toBeDefined();
    if (!slot) return;
    const [first, second] = await Promise.allSettled([
      calendar.book(slot.id, 'lead-a', 'c1'),
      calendar.book(slot.id, 'lead-b', 'c2'),
    ]);
    const fulfilled = [first, second].filter((result) => result.status === 'fulfilled');
    const rejected = [first, second].filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotTakenError);
    expect(await calendar.listOpen(NOW)).not.toContainEqual(
      expect.objectContaining({ id: slot.id }),
    );
  });

  it('releases a booking back to the open list', async () => {
    const calendar = new MemoryCalendar(NOW, TZ, () => 'appt-9');
    const [slot] = await calendar.listOpen(NOW);
    if (!slot) throw new Error('expected a slot');
    const appointment = await calendar.book(slot.id, 'lead-a', 'c1');
    calendar.release(appointment.id);
    calendar.release(appointment.id);
    const open = await calendar.listOpen(NOW);
    expect(open.some((item) => item.id === slot.id)).toBe(true);
    expect(calendar.getAppointment(appointment.id)?.status).toBe('cancelled');
    expect(calendar.getAppointment('missing')).toBeNull();
  });

  it('chooses morning and afternoon slots', async () => {
    const calendar = new MemoryCalendar(NOW, TZ);
    const open = await calendar.listOpen(NOW);
    const morning = chooseSlot(open, { kind: 'morning' }, TZ);
    const afternoon = chooseSlot(open, { kind: 'afternoon' }, TZ);
    expect(typeof morning).toBe('object');
    expect(typeof afternoon).toBe('object');
    expect(chooseSlot(open, { kind: 'out_of_hours', reason: 'closed' }, TZ)).toBe('out_of_hours');
    expect(chooseSlot(open, { kind: 'none' }, TZ)).toBe('none');
    expect(chooseSlot([], { kind: 'specific', hour: 9, minute: 15 }, TZ)).toBe('none');
  });
});
