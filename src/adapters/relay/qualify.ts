import { NEIGHBORHOODS } from '@/domain/listings/data';
import type { PropertyType, Slots, Timeline } from '@/domain/types';
import { PROPERTY_TYPES, TIMELINES } from '@/domain/types';

import { RelayClient, RelayHttpError } from './client';

export type LiveExtraction = {
  reply: string;
  slots: Partial<Slots>;
  book: boolean;
};

export async function qualifyWithRelay(
  client: RelayClient,
  input: {
    text: string;
    slots: Slots;
    history: { role: 'user' | 'assistant'; text: string }[];
  },
): Promise<LiveExtraction> {
  const result = await client.chat({
    maxTokens: 500,
    temperature: 0.2,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You qualify buyers for Harborline Realty, a fictional brokerage. Listings are synthetic. Return JSON only with keys reply, propertyType, beds, area, budgetMax, timeline, and book. propertyType is condo, townhouse, single_family, multi_family, or null. timeline is asap, 30_days, 90_days, 6_months, browsing, or null. area is one of the supplied neighborhoods or null. budgetMax is US dollars or null. book is true only when the user asks to schedule a tour. reply is one or two short sentences. Do not invent addresses, prices, or appointment times. Do not give legal, financial, or fair-housing advice.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          neighborhoods: NEIGHBORHOODS,
          slots: input.slots,
          history: input.history.slice(-8).map((item) => ({
            role: item.role,
            text: item.text.slice(0, 500),
          })),
          message: input.text,
        }),
      },
    ],
  });
  return parseModelPayload(result.content);
}

export function parseModelPayload(content: string): LiveExtraction {
  const parsed: unknown = JSON.parse(stripFence(content));
  if (!parsed || typeof parsed !== 'object') throw new RelayHttpError(502, 'bad_model_payload');
  const record = parsed as Record<string, unknown>;
  const reply = typeof record.reply === 'string' ? record.reply.trim() : '';
  if (reply.length < 8) throw new RelayHttpError(502, 'bad_model_payload');
  return { reply, slots: sanitizeSlots(record), book: record.book === true };
}

export function sanitizeSlots(record: Record<string, unknown>): Partial<Slots> {
  const slots: Partial<Slots> = {};
  if (isPropertyType(record.propertyType)) slots.propertyType = record.propertyType;
  if (
    typeof record.beds === 'number' &&
    Number.isInteger(record.beds) &&
    record.beds >= 1 &&
    record.beds <= 8
  ) {
    slots.beds = record.beds;
  }
  if (typeof record.area === 'string') {
    const area = NEIGHBORHOODS.find(
      (name) => name.toLowerCase() === record.area?.toString().toLowerCase(),
    );
    if (area) slots.area = area;
  }
  if (
    typeof record.budgetMax === 'number' &&
    Number.isFinite(record.budgetMax) &&
    record.budgetMax >= 50_000 &&
    record.budgetMax <= 50_000_000
  ) {
    slots.budget = { max: Math.round(record.budgetMax), currency: 'USD' };
  }
  if (isTimeline(record.timeline)) slots.timeline = record.timeline;
  return slots;
}

export function replyLooksUsable(reply: string, userText: string): boolean {
  const trimmed = reply.trim();
  if (trimmed.length < 8 || trimmed.length > 900) return false;
  const prices = trimmed.match(/\$\s?\d[\d,]*/g) ?? [];
  return prices.every((price) => userText.includes(price.replaceAll(' ', '')));
}

function stripFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? trimmed;
}

function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === 'string' && (PROPERTY_TYPES as readonly string[]).includes(value);
}

function isTimeline(value: unknown): value is Timeline {
  return typeof value === 'string' && (TIMELINES as readonly string[]).includes(value);
}
