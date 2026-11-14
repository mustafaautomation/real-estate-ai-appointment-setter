export type CivilParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function zonedParts(date: Date, timeZone: string): CivilParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  const weekdayLabel = map.weekday ?? '';
  const weekday = WEEKDAYS.indexOf(weekdayLabel as (typeof WEEKDAYS)[number]);
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday,
  };
}

function sameCivil(
  parts: CivilParts,
  local: { year: number; month: number; day: number; hour: number; minute: number },
): boolean {
  return (
    parts.year === local.year &&
    parts.month === local.month &&
    parts.day === local.day &&
    parts.hour === local.hour &&
    parts.minute === local.minute
  );
}

function offsetMinutes(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((asUtc - date.getTime()) / 60_000);
}

export function zonedLocalToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): { status: 'ok' | 'gap' | 'ambiguous'; utc?: Date } {
  const utcGuess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, 0);
  const firstOffset = offsetMinutes(new Date(utcGuess), timeZone);
  let instant = utcGuess - firstOffset * 60_000;
  const secondOffset = offsetMinutes(new Date(instant), timeZone);
  instant = utcGuess - secondOffset * 60_000;
  const back = zonedParts(new Date(instant), timeZone);
  if (!sameCivil(back, local)) return { status: 'gap' };
  for (const deltaMinutes of [-60, 60]) {
    const other = zonedParts(new Date(instant + deltaMinutes * 60_000), timeZone);
    if (sameCivil(other, local)) return { status: 'ambiguous', utc: new Date(instant) };
  }
  return { status: 'ok', utc: new Date(instant) };
}

export function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function addCivilDays(date: Date, timeZone: string, days: number): CivilParts {
  const parts = zonedParts(date, timeZone);
  const noon = zonedLocalToUtc(
    { year: parts.year, month: parts.month, day: parts.day, hour: 12, minute: 0 },
    timeZone,
  );
  const anchor = noon.utc ?? date;
  return zonedParts(new Date(anchor.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
}

export function isWeekday(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}
