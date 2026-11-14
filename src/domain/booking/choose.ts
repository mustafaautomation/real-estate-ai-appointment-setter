import type { SchedulePreference, TimeSlot } from '../types';
import { localHour } from './slots';
import { zonedParts } from './time';

export function chooseSlot(
  slots: readonly TimeSlot[],
  preference: SchedulePreference,
  timeZone: string,
  afterIso?: string,
): TimeSlot | 'none' | 'out_of_hours' {
  if (preference.kind === 'none') return 'none';
  if (preference.kind === 'out_of_hours') return 'out_of_hours';
  let open = slots.filter((slot) => (afterIso ? slot.start > afterIso : true));
  if (preference.kind === 'morning') {
    open = open.filter((slot) => localHour(slot.start, timeZone) < 12);
  }
  if (preference.kind === 'afternoon') {
    open = open.filter((slot) => localHour(slot.start, timeZone) >= 12);
  }
  if (preference.kind === 'specific') {
    open = open.filter((slot) => {
      const parts = zonedParts(new Date(slot.start), timeZone);
      return parts.hour === preference.hour && parts.minute === preference.minute;
    });
  }
  return open[0] ?? 'none';
}
