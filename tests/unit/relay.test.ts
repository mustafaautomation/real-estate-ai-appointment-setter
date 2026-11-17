import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateSlots } from '@/domain/booking/slots';
import { SlotTakenError } from '@/domain/errors';
import {
  RelayClient,
  RelayHttpError,
  isRelayFallback,
  relayBaseUrl,
  storeId,
} from '@/adapters/relay/client';
import { parseModelPayload, sanitizeSlots } from '@/adapters/relay/qualify';
import { ReserveCalendar } from '@/adapters/relay/reserve-calendar';
import { POST as chatPost } from '@/app/api/chat/route';
import { resetContainer } from '@/server/container';
import { runWithClientIp } from '@/server/request-context';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.LLM_RELAY_URL;
  delete process.env.LLM_RELAY_TOKEN;
  resetContainer();
});

describe('relay client', () => {
  it('strips /v1/chat and forwards the visitor IP', async () => {
    expect(relayBaseUrl('https://relay.example/v1/chat/')).toBe('https://relay.example');
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ content: '{"reply":"Noted, I can help with that."}' }),
    );
    const client = new RelayClient(
      'https://relay.example/v1/chat',
      'secret',
      fetchImpl as typeof fetch,
    );
    await runWithClientIp('203.0.113.8', () =>
      client.chat({ messages: [{ role: 'user', content: 'hello there' }] }),
    );
    const call = fetchImpl.mock.calls[0];
    expect(call?.[0]).toBe('https://relay.example/v1/chat');
    const init = call?.[1];
    expect(init).toBeTruthy();
    if (!init) return;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secret');
    expect(headers['x-client-ip']).toBe('203.0.113.8');
    const body = JSON.parse(String(init.body)) as { max_tokens: number; model?: string };
    expect(body.model).toBeUndefined();
    expect(body.max_tokens).toBeLessThanOrEqual(600);
    expect(storeId('web:lead')).toBe('web:lead');
    expect(storeId('has a space')).toMatch(/^id\.[a-f0-9]{40}$/);
  });

  it('treats 429, 502, and timeouts as fallbacks', () => {
    expect(isRelayFallback(new RelayHttpError(429, 'rate_limited'))).toBe(true);
    expect(isRelayFallback(new RelayHttpError(502, 'upstream_error'))).toBe(true);
    expect(isRelayFallback(new RelayHttpError(401, 'unauthorized'))).toBe(false);
    const timeout = new Error('timed out');
    timeout.name = 'TimeoutError';
    expect(isRelayFallback(timeout)).toBe(true);
    expect(isRelayFallback(new SyntaxError('bad json'))).toBe(true);
  });

  it('parses model JSON and drops unknown areas', () => {
    const parsed = parseModelPayload(
      '```json\n{"reply":"A condo in Lantern Hill works.","propertyType":"condo","beds":3,"area":"Lantern Hill","budgetMax":700000,"timeline":"30_days","book":false}\n```',
    );
    expect(parsed.reply).toContain('Lantern Hill');
    expect(parsed.slots).toMatchObject({
      propertyType: 'condo',
      beds: 3,
      area: 'Lantern Hill',
      timeline: '30_days',
    });
    expect(parsed.slots.budget?.max).toBe(700_000);
    expect(sanitizeSlots({ area: 'Not A Place', beds: 0, propertyType: 'castle' })).toEqual({});
  });
});

describe('reserve calendar', () => {
  it('rejects a second reserve of the same slot', async () => {
    const slot = generateSlots(new Date(), 'America/Chicago', 2)[0];
    expect(slot).toBeTruthy();
    let reserves = 0;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        reserves += 1;
        if (reserves === 1) return json({ ok: true }, 201);
        return json({ error: 'slot_taken', held_by: 'other-lead' }, 409);
      }
      return json({ items: [] });
    });
    const calendar = new ReserveCalendar(
      new RelayClient('https://relay.example', 'secret', fetchImpl as typeof fetch),
      'America/Chicago',
    );
    const booked = await calendar.book(slot?.id ?? '', 'lead-a', 'conversation-a');
    expect(booked.slotId).toBe(slot?.id);
    await expect(calendar.book(slot?.id ?? '', 'lead-b', 'conversation-b')).rejects.toBeInstanceOf(
      SlotTakenError,
    );
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      slot_key: string;
    };
    expect(firstBody.slot_key).toBe(slot?.id);
  });
});

describe('live fallback', () => {
  it('uses the offline template when the model returns 429', async () => {
    process.env.LLM_RELAY_URL = 'https://relay.example/v1/chat';
    process.env.LLM_RELAY_TOKEN = 'secret';
    resetContainer();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (String(url).endsWith('/v1/chat')) return json({ error: 'rate_limited' }, 429);
        if (method === 'GET' && String(url).includes('?')) return json({ items: [] });
        if (method === 'GET') return new Response('', { status: 404 });
        return json({ ok: true });
      }),
    );
    const response = await chatPost(
      new Request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({
          text: 'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.',
          idempotencyKey: 'relay-fallback-01',
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mode: string; reply: string; listings: unknown[] };
    expect(body.mode).toBe('offline_fallback');
    expect(body.reply.length).toBeGreaterThan(8);
    expect(body.listings.length).toBeGreaterThan(0);
    const chatCall = (
      fetch as unknown as { mock: { calls: [string, RequestInit?][] } }
    ).mock.calls.find((call) => String(call[0]).endsWith('/v1/chat'));
    expect((chatCall?.[1]?.headers as Record<string, string>)['x-client-ip']).toBe('203.0.113.9');
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
