import type { TimeSlot } from '../types';
import { addCivilDays, isWeekday, zonedLocalToUtc, zonedParts } from './time';

const OPEN_MINUTES = [0, 30] as const;

export function generateSlots(now: Date, timeZone: string, businessDays: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  let foundDays = 0;
  for (let offset = 0; offset < businessDays + 14 && foundDays < businessDays; offset += 1) {
    const civil = addCivilDays(now, timeZone, offset);
    if (!isWeekday(civil.weekday)) continue;
    foundDays += 1;
    for (let hour = 9; hour <= 16; hour += 1) {
      for (const minute of OPEN_MINUTES) {
        const converted = zonedLocalToUtc(
          { year: civil.year, month: civil.month, day: civil.day, hour, minute },
          timeZone,
        );
        if (converted.status === 'gap' || !converted.utc) continue;
        if (converted.utc.getTime() <= now.getTime()) continue;
        const start = converted.utc.toISOString();
        const end = new Date(converted.utc.getTime() + 30 * 60_000).toISOString();
        slots.push({ id: `slot_${start}`, start, end, timezone: timeZone });
      }
    }
  }
  return slots;
}

export function localHour(iso: string, timeZone: string): number {
  return zonedParts(new Date(iso), timeZone).hour;
}
