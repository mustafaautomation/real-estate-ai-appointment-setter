import type { SchedulePreference } from '../types';

export function isStopKeyword(text: string): boolean {
  return /^(stop|stopall|unsubscribe|end|quit)$/i.test(text.trim());
}

export function isStartKeyword(text: string): boolean {
  return /^(start|unstop)$/i.test(text.trim());
}

export function wantsHuman(text: string): boolean {
  return (
    /\b(talk|speak|transfer|connect)\b.{0,32}\b(human|person|agent|someone|representative)\b/i.test(
      text,
    ) || /\b(real person|human agent|live agent)\b/i.test(text)
  );
}

export function hasRescheduleIntent(text: string): boolean {
  return /\b(reschedule|move (my|the) (tour|appointment|showing)|different time)\b/i.test(text);
}

export function hasBookingIntent(text: string): boolean {
  if (
    /\b(do not|don't|dont|not)\b.{0,40}\b(book|schedule|tour|showing|appointment)\b/i.test(text)
  ) {
    return false;
  }
  return /\b(book|schedule|tour|showing|earliest|first available)\b/i.test(text);
}

export function detectObjection(text: string): 'price' | 'area' | 'size' | null {
  if (
    /\b(too expensive|too pricey|out of (my )?budget|cheaper|less expensive|lower price)\b/i.test(
      text,
    )
  ) {
    return 'price';
  }
  if (
    /\b(not that area|somewhere else|different (area|neighborhood|neighbourhood)|wrong area)\b/i.test(
      text,
    )
  ) {
    return 'area';
  }
  if (/\b(too small|more bedrooms|bigger place|too big|fewer bedrooms)\b/i.test(text))
    return 'size';
  return null;
}

export function wantsSummary(text: string): boolean {
  return /\b(what do you have|what have you got|remind me|my criteria|so far|what did i tell)\b/i.test(
    text,
  );
}

export function interpretSchedule(text: string): SchedulePreference {
  if (/\b(saturday|sunday|weekend|tonight)\b/i.test(text)) {
    return {
      kind: 'out_of_hours',
      reason: 'The desk books tours on weekdays, 9:00–17:00 America/Chicago.',
    };
  }
  const clock = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (clock?.[1] && clock[3]) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] ?? '0');
    const meridiem = clock[3].toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59 || hour > 23) {
      return {
        kind: 'out_of_hours',
        reason: 'That time is outside desk hours, weekdays 9:00–17:00 America/Chicago.',
      };
    }
    if (hour < 9 || hour >= 17) {
      return {
        kind: 'out_of_hours',
        reason: 'That time is outside desk hours, weekdays 9:00–17:00 America/Chicago.',
      };
    }
    return { kind: 'specific', hour, minute };
  }
  if (/\b(earliest|first available)\b/i.test(text)) return { kind: 'earliest' };
  if (/\bafternoon\b/i.test(text)) return { kind: 'afternoon' };
  if (/\bmorning\b/i.test(text)) return { kind: 'morning' };
  return { kind: 'earliest' };
}
