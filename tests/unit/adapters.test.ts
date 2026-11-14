import { describe, expect, it, vi } from 'vitest';

import { CalComCalendar } from '@/adapters/calendar/calcom';
import { GoogleCalendar } from '@/adapters/calendar/google';
import { parseEmail, parseInstagram, parseSms, voiceToolSchema } from '@/adapters/channels/parse';
import { allowRequest, resetRateLimit } from '@/adapters/http/rate-limit';
import {
  emailSignature,
  metaSignature,
  safeEqual,
  twilioSignature,
  verifyEmail,
  verifyMeta,
  verifyTwilio,
} from '@/adapters/http/signatures';
import { createLogger, redact } from '@/adapters/logging/logger';
import { OfflineReplyModel, OpenAiReplyModel } from '@/adapters/llm/model';
import { MemoryRepository } from '@/adapters/storage/memory';
import { SqlRepository } from '@/adapters/storage/sql-repository';
import { claimSlot, SqliteExecutor } from '@/adapters/storage/sqlite';
import { CalendarNotConfiguredError } from '@/domain/errors';

describe('channel parsers', () => {
  it('parses Twilio, email, and Instagram shapes', () => {
    expect(
      parseSms({ MessageSid: 'SM1', From: '+15551212', To: '+15550000', Body: 'Hello there' }),
    ).toMatchObject({ channel: 'sms', externalMessageId: 'SM1', text: 'Hello there' });
    expect(
      parseEmail({
        messageId: 'm1',
        from: 'a@example.com',
        to: 'desk@example.com',
        text: 'Need a condo',
      }).channel,
    ).toBe('email');
    expect(
      parseInstagram({
        object: 'instagram',
        entry: [
          {
            messaging: [
              {
                sender: { id: 'ig1' },
                recipient: { id: 'page' },
                message: { mid: 'mid1', text: 'Hi' },
              },
            ],
          },
        ],
      }).externalUserId,
    ).toBe('ig1');
    expect(
      voiceToolSchema.parse({
        callId: 'call-1',
        tool: { name: 'book_appointment', arguments: { leadId: 'lead-1', preference: 'earliest' } },
      }).tool.name,
    ).toBe('book_appointment');
  });
});

describe('signatures and rate limit', () => {
  it('verifies Twilio and Meta signatures and rejects mismatches', () => {
    const params = { Body: 'Hi', From: '+1', To: '+2', MessageSid: 'SM1' };
    const url = 'http://desk.local/api/webhooks/sms';
    const token = 'test-twilio-token';
    const signature = twilioSignature(url, params, token);
    expect(verifyTwilio(url, params, token, signature)).toBe(true);
    expect(verifyTwilio(url, params, token, 'nope')).toBe(false);
    expect(verifyTwilio(url, params, token, null)).toBe(false);
    const raw = '{"ok":true}';
    const meta = metaSignature(raw, 'test-meta-secret');
    expect(verifyMeta(raw, 'test-meta-secret', meta)).toBe(true);
    expect(verifyMeta(raw, 'test-meta-secret', 'sha256=00')).toBe(false);
    expect(safeEqual('a', 'ab')).toBe(false);
    process.env.EMAIL_WEBHOOK_SECRET = 'email-secret';
    expect(verifyEmail(raw, emailSignature(raw, 'email-secret'))).toBe(true);
    expect(verifyEmail(raw, 'ff')).toBe(false);
    delete process.env.EMAIL_WEBHOOK_SECRET;
    expect(verifyEmail(raw, null)).toBe(true);
  });

  it('limits a key inside the window', () => {
    resetRateLimit();
    process.env.RATE_LIMIT_MAX = '2';
    expect(allowRequest('ip', 1_000)).toBe(true);
    expect(allowRequest('ip', 1_100)).toBe(true);
    expect(allowRequest('ip', 1_200)).toBe(false);
    expect(allowRequest('ip', 70_000)).toBe(true);
  });
});

describe('redaction', () => {
  it('removes email, phone, and SSN from log fields', () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));
    logger.info('inbound', {
      requestId: 'req-12345678',
      from: 'user@example.com',
      note: 'call +14155551212 or 415-555-1212, ssn 123-45-6789',
    });
    const text = lines[0] ?? '';
    expect(text).not.toContain('example.com');
    expect(text).not.toContain('4155551212');
    expect(text).not.toContain('123-45-6789');
    expect(text).toContain('req-12345678');
    expect(redact('plain')).toBe('plain');
    logger.warn('w', { requestId: 12 });
    logger.error('e', {});
  });
});

describe('repositories', () => {
  it('round-trips records in memory', () => {
    const repo = new MemoryRepository();
    repo.upsertLead({
      id: 'l1',
      channel: 'web',
      externalUserId: 'visitor',
      score: 10,
      stage: 'qualifying',
      slots: {},
      conversationId: 'c1',
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    });
    expect(repo.getLead('l1')?.id).toBe('l1');
    expect(repo.getLead('missing')).toBeNull();
    expect(repo.listLeads()).toHaveLength(1);
    const pending = repo.claimIdempotency({
      key: 'sms:1',
      status: 0,
      contentType: 'application/json',
      body: '',
      createdAt: '2026-04-08T00:00:00.000Z',
    });
    expect(pending).toBeNull();
    expect(
      repo.claimIdempotency({
        key: 'sms:1',
        status: 0,
        contentType: 'application/json',
        body: '',
        createdAt: '2026-04-08T00:00:00.000Z',
      })?.status,
    ).toBe(0);
    repo.saveIdempotency({
      key: 'sms:1',
      status: 200,
      contentType: 'application/json',
      body: '{}',
      createdAt: '2026-04-08T00:00:00.000Z',
    });
    expect(repo.getIdempotency('sms:1')?.status).toBe(200);
    repo.deleteIdempotency('sms:1');
    expect(repo.getIdempotency('sms:1')).toBeNull();
  });

  it('round-trips SQL and rejects a second slot claim', () => {
    const executor = new SqliteExecutor(':memory:');
    const repo = new SqlRepository(executor);
    repo.upsertConversation({
      id: 'c1',
      leadId: 'l1',
      channel: 'sms',
      externalUserId: '+15550001',
      session: {
        id: 'c1',
        leadId: 'l1',
        channel: 'sms',
        stage: 'collecting',
        slots: { area: 'Old Keel' },
        language: 'en',
        optedOut: false,
        handoff: false,
        listingIds: [],
        turnCount: 1,
      },
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    });
    expect(repo.findConversation('sms', '+15550001')?.id).toBe('c1');
    repo.addMessage({
      id: 'm1',
      conversationId: 'c1',
      role: 'user',
      text: 'hello',
      channel: 'sms',
      createdAt: '2026-04-08T00:00:00.000Z',
    });
    expect(repo.listMessages('c1')).toHaveLength(1);
    repo.addLatency({
      id: 'lat1',
      channel: 'sms',
      conversationId: 'c1',
      latencyMs: 4,
      createdAt: '2026-04-08T00:00:00.000Z',
    });
    expect(repo.listLatencies()).toHaveLength(1);
    expect(
      repo.claimIdempotency({
        key: 'k1',
        status: 0,
        contentType: 'application/json',
        body: '',
        createdAt: '2026-04-08T00:00:00.000Z',
      }),
    ).toBeNull();
    expect(
      repo.claimIdempotency({
        key: 'k1',
        status: 200,
        contentType: 'application/json',
        body: 'stored',
        createdAt: '2026-04-08T00:00:00.000Z',
      })?.status,
    ).toBe(0);
    expect(claimSlot(executor, 'slot-1')).toBe(true);
    expect(claimSlot(executor, 'slot-1')).toBe(false);
    const other = new SqliteExecutor(':memory:');
    expect(claimSlot(other, 'slot-1')).toBe(true);
    executor.close();
    other.close();
  });
});

describe('optional calendars and the model', () => {
  it('refuses Cal.com and Google without credentials', () => {
    expect(
      () =>
        new CalComCalendar({
          apiKey: '',
          eventTypeId: '',
          baseUrl: 'https://api.cal.com/v2',
          timeZone: 'America/Chicago',
        }),
    ).toThrow(CalendarNotConfiguredError);
    expect(
      () => new GoogleCalendar({ accessToken: '', calendarId: '', timeZone: 'America/Chicago' }),
    ).toThrow(CalendarNotConfiguredError);
  });

  it('maps Cal.com slots and posts a booking', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === 'GET') {
        return new Response(
          JSON.stringify({
            data: { slots: { '2026-04-09': [{ start: '2026-04-09T15:00:00.000Z' }] } },
          }),
          { status: 200 },
        );
      }
      expect(url).toContain('/v2/bookings');
      return new Response(JSON.stringify({ id: 'remote' }), { status: 200 });
    });
    const calendar = new CalComCalendar({
      apiKey: 'cal-key',
      eventTypeId: '42',
      baseUrl: 'https://api.cal.com/v2',
      timeZone: 'America/Chicago',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const slots = await calendar.listOpen(new Date('2026-04-08T15:00:00.000Z'));
    expect(slots).toHaveLength(1);
    const appointment = await calendar.book(slots[0]!.id, 'lead-1', 'c1');
    expect(appointment.status).toBe('booked');
    calendar.release(appointment.id);
    expect(calendar.getAppointment(appointment.id)?.status).toBe('cancelled');
    expect(calendar.listAppointments()).toHaveLength(1);
  });

  it('subtracts Google busy time and inserts an event', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST' && String(init.body).includes('timeMin')) {
        return new Response(
          JSON.stringify({
            calendars: {
              primary: {
                busy: [{ start: '2026-04-08T15:30:00.000Z', end: '2026-04-08T16:00:00.000Z' }],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ id: 'evt-1' }), { status: 200 });
    });
    const calendar = new GoogleCalendar({
      accessToken: 'token',
      calendarId: 'primary',
      timeZone: 'America/Chicago',
      fetchImpl: fetchImpl as typeof fetch,
    });
    const slots = await calendar.listOpen(new Date('2026-04-08T15:00:00.000Z'));
    expect(slots.some((slot) => slot.start === '2026-04-08T15:30:00.000Z')).toBe(false);
    const target = slots[0];
    expect(target).toBeDefined();
    if (!target) return;
    const appointment = await calendar.book(target.id, 'lead-1', 'c1');
    expect(appointment.id).toBe('evt-1');
    expect(calendar.getAppointment('missing')).toBeNull();
  });

  it('keeps the offline draft and falls back when OpenAI fails', async () => {
    const offline = new OfflineReplyModel();
    await expect(
      offline.rephrase({ draft: 'The tour is booked', facts: ['booked'] }),
    ).resolves.toBe('The tour is booked');
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"reply":"The tour is booked for Thursday."}' } }],
          }),
          { status: 200 },
        ),
      );
    const model = new OpenAiReplyModel('test-key', 'gpt-4o-mini', 50, 1, fetchImpl as typeof fetch);
    await expect(
      model.rephrase({ draft: 'The tour is booked', facts: ['booked'] }),
    ).resolves.toContain('booked');
    const broken = new OpenAiReplyModel(
      'test-key',
      'gpt-4o-mini',
      20,
      0,
      vi.fn(async () => new Response('no', { status: 500 })) as typeof fetch,
    );
    await expect(
      broken.rephrase({ draft: 'The tour is booked', facts: ['booked'] }),
    ).rejects.toThrow();
  });
});
