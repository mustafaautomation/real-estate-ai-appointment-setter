import { NEIGHBORHOODS } from '../listings/data';
import type { Budget, PropertyType, Slots, Timeline } from '../types';

const WORD_BEDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
};

export function extractSlots(
  text: string,
  areas: readonly string[] = NEIGHBORHOODS,
): Partial<Slots> {
  const slots: Partial<Slots> = {};
  const budget = extractBudget(text);
  if (budget) slots.budget = budget;
  const beds = extractBeds(text);
  if (beds !== undefined) slots.beds = beds;
  const propertyType = extractType(text);
  if (propertyType) slots.propertyType = propertyType;
  const area = extractArea(text, areas);
  if (area) slots.area = area;
  const timeline = extractTimeline(text);
  if (timeline) slots.timeline = timeline;
  return slots;
}

export function extractBudget(text: string): Budget | undefined {
  if (!hasMoneyCue(text)) return undefined;
  const range =
    /(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s*)(k|m|thousand|million)?\s*(?:-|–|to|and)\s*(?:\$\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s*)(k|m|thousand|million)?/gi;
  for (const match of text.matchAll(range)) {
    const left = match[1];
    const right = match[4];
    if (!left || !right) continue;
    const pair = resolvePair(left, match[3], right, match[6]);
    if (pair && pair.max !== undefined && pair.max >= 50_000 && pair.max <= 50_000_000) return pair;
  }
  const single = /(\$?)\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(\s*)(k|m|thousand|million)?/gi;
  // An explicit amount ($, a suffix, comma grouping, or a full figure) beats a bare
  // "hundreds mean thousands" guess, so "move in 2027, budget 500k" reads 500k, not 2027k.
  let fallback: Budget | undefined;
  for (const match of text.matchAll(single)) {
    const raw = match[2];
    if (!raw) continue;
    const dollar = match[1] === '$';
    const amount = resolveSingle(raw, match[4], dollar);
    if (amount === undefined || amount < 50_000 || amount > 50_000_000) continue;
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 32), index).toLowerCase();
    const budget: Budget =
      /\b(at least|over|minimum|from)\b/.test(before) && !/\b(under|below|up to|max)\b/.test(before)
        ? { min: amount, currency: 'USD' }
        : { max: amount, currency: 'USD' };
    const explicit = dollar || Boolean(match[4]) || raw.includes(',') || Number(raw) >= 10_000;
    if (explicit) return budget;
    fallback ??= budget;
  }
  return fallback;
}

function hasMoneyCue(text: string): boolean {
  return /\$|\d\s*[km]\b|million|thousand|budget|presupuesto|precio|price|spend|under|below|around|about|between|at least/i.test(
    text,
  );
}

function resolvePair(
  left: string,
  leftSuffix: string | undefined,
  right: string,
  rightSuffix: string | undefined,
): Budget | undefined {
  let suffixA = normalizeSuffix(leftSuffix);
  let suffixB = normalizeSuffix(rightSuffix);
  if (!suffixA && suffixB) suffixA = suffixB;
  if (!suffixB && suffixA) suffixB = suffixA;
  const a = resolveSingle(left, suffixA, left.includes(','));
  const b = resolveSingle(right, suffixB, right.includes(','));
  if (a === undefined || b === undefined) return undefined;
  return { min: Math.min(a, b), max: Math.max(a, b), currency: 'USD' };
}

function normalizeSuffix(suffix: string | undefined): string | undefined {
  if (!suffix) return undefined;
  return suffix.trim().toLowerCase();
}

function resolveSingle(
  num: string,
  suffix: string | undefined,
  dollarOrRaw: boolean,
): number | undefined {
  const n = Number(num.replace(/,/g, ''));
  if (!Number.isFinite(n)) return undefined;
  const s = (suffix ?? '').toLowerCase();
  if (s === 'k' || s === 'thousand') return Math.round(n * 1_000);
  if (s === 'm' || s === 'million') return Math.round(n * 1_000_000);
  if (n >= 10_000) return Math.round(n);
  if (!dollarOrRaw && n >= 100 && n < 10_000) return Math.round(n * 1_000);
  return undefined;
}

export function extractBeds(text: string): number | undefined {
  const match = text.match(
    /\b(\d+|one|two|three|four|five|six|uno|una|dos|tres|cuatro|cinco)\s*(?:bed(?:room)?s?|br|bd|habitaciones|dormitorios|rec[aá]maras)\b/i,
  );
  if (!match?.[1]) return undefined;
  const token = match[1].toLowerCase();
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    if (value >= 1 && value <= 12) return value;
    return undefined;
  }
  return WORD_BEDS[token];
}

export function extractType(text: string): PropertyType | undefined {
  if (/\b(multi[-\s]?family|duplex|fourplex|triplex)\b/i.test(text)) return 'multi_family';
  if (/\b(town\s?houses?|townhomes?|adosados?)\b/i.test(text)) return 'townhouse';
  if (/\b(condos?|condominiums?|condominios?)\b/i.test(text)) return 'condo';
  if (/\b(single[-\s]?family|sfh|detached)\b/i.test(text)) return 'single_family';
  if (
    /\b(houses?|homes?|casas?|maison)\b/i.test(text) &&
    !/\b(open house|warehouse|greenhouse)\b/i.test(text)
  ) {
    return 'single_family';
  }
  return undefined;
}

export function extractArea(text: string, areas: readonly string[]): string | undefined {
  const haystack = text.toLowerCase();
  const ordered = [...areas].sort((a, b) => b.length - a.length);
  for (const area of ordered) {
    if (haystack.includes(area.toLowerCase())) return area;
  }
  return undefined;
}

export function extractTimeline(text: string): Timeline | undefined {
  if (
    /\b(just looking|browsing|no rush|someday|exploring|not sure when|window shopping)\b/i.test(
      text,
    )
  ) {
    return 'browsing';
  }
  if (/\b((?:6|six)\s+months|half a year|next year)\b/i.test(text)) return '6_months';
  if (/\b(90\s*days|(?:3|three)\s+months|couple of months)\b/i.test(text)) return '90_days';
  if (/\b(30\s*days|this month|next month|within a month|in a month|este mes)\b/i.test(text)) {
    return '30_days';
  }
  if (
    /\b(asap|as soon as possible|immediately|right away|urgent|lo antes posible|cuanto antes|pronto)\b/i.test(
      text,
    )
  ) {
    return 'asap';
  }
  return undefined;
}
