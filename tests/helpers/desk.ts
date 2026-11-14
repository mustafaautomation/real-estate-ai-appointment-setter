import { MemoryCalendar } from '@/domain/booking/memory-calendar';
import { handleTurn, type TurnDecision } from '@/domain/conversation/engine';
import { createSession } from '@/domain/conversation/session';
import { LISTINGS } from '@/domain/listings/data';
import type { CalendarPort, Channel, Session } from '@/domain/types';

export const NOW = new Date('2026-04-08T15:00:00.000Z');
export const TZ = 'America/Chicago';

export async function converse(
  lines: readonly string[],
  channel: Channel = 'web',
  calendar: CalendarPort = new MemoryCalendar(NOW, TZ, sequence()),
): Promise<{ session: Session; turns: TurnDecision[]; calendar: CalendarPort }> {
  let session = createSession({ id: 'c1', leadId: 'l1', channel });
  const turns: TurnDecision[] = [];
  for (const line of lines) {
    const decision = await handleTurn({
      session,
      text: line,
      now: NOW,
      calendar,
      listings: LISTINGS,
      timeZone: TZ,
    });
    session = decision.session;
    turns.push(decision);
  }
  return { session, turns, calendar };
}

export function sequence(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `appt-${n}`;
  };
}

export const QUALIFIED =
  'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.';
