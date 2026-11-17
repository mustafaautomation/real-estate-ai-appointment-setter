import { afterEach, describe, expect, it, vi } from 'vitest';

import { emailSignature, metaSignature, twilioSignature } from '@/adapters/http/signatures';
import { POST as chatPost } from '@/app/api/chat/route';
import { GET as healthGet } from '@/app/api/health/route';
import { GET as leadGet } from '@/app/api/leads/[id]/route';
import { GET as leadsGet } from '@/app/api/leads/route';
import { GET as metricsGet } from '@/app/api/metrics/route';
import { POST as dispatchPost } from '@/app/api/simulator/dispatch/route';
import { POST as emailPost } from '@/app/api/webhooks/email/route';
import { GET as instagramGet, POST as instagramPost } from '@/app/api/webhooks/instagram/route';
import { POST as smsPost } from '@/app/api/webhooks/sms/route';
import { GET as voiceGet, POST as voicePost } from '@/app/api/webhooks/voice/route';
import { getContainer } from '@/server/container';

const SMS_URL = 'http://127.0.0.1:3000/api/webhooks/sms';

function smsRequest(body: string, sid: string, signature?: string | null): Request {
  const params = {
    MessageSid: sid,
    From: '+15550199999',
    To: '+15557654321',
    Body: body,
    AccountSid: 'ACdemo',
  };
  const headers = new Headers({
    'content-type': 'application/x-www-form-urlencoded',
    'x-harborline-response': 'json',
  });
  const signed =
    signature === undefined ? twilioSignature(SMS_URL, params, 'test-twilio-token') : signature;
  if (signed) headers.set('x-twilio-signature', signed);
  return new Request(SMS_URL, {
    method: 'POST',
    headers,
    body: new URLSearchParams(params).toString(),
  });
}

describe('HTTP routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports health without claiming a live voice line', async () => {
    const response = healthGet(new Request('http://127.0.0.1:3000/api/health'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { llm: string; voice: string };
    expect(body.llm).toBe('offline');
    expect(body.voice).toBe('stub');
  });

  it('qualifies and books through site chat, then shows the lead and measured latency', async () => {
    const first = await chatPost(
      new Request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.',
          idempotencyKey: 'chat-key-0001',
        }),
      }),
    );
    expect(first.status).toBe(200);
    const opened = (await first.json()) as {
      conversationId: string;
      mode: string;
      listings: unknown[];
    };
    expect(opened.mode).toBe('offline');
    expect(opened.listings.length).toBeGreaterThan(0);
    const second = await chatPost(
      new Request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Book the earliest slot',
          conversationId: opened.conversationId,
          idempotencyKey: 'chat-key-0002',
        }),
      }),
    );
    const booked = (await second.json()) as {
      appointment: { label: string } | null;
      leadId: string;
    };
    expect(booked.appointment?.label).toBeTruthy();
    const replay = await chatPost(
      new Request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: 'Book the earliest slot',
          conversationId: opened.conversationId,
          idempotencyKey: 'chat-key-0002',
        }),
      }),
    );
    expect(replay.headers.get('idempotent-replay')).toBe('true');
    const leads = await leadsGet(new Request('http://127.0.0.1:3000/api/leads'));
    const leadBody = (await leads.json()) as { leads: { id: string; stage: string }[] };
    expect(leadBody.leads.some((lead) => lead.stage === 'booked')).toBe(true);
    const detail = await leadGet(new Request(`http://127.0.0.1:3000/api/leads/${booked.leadId}`), {
      params: Promise.resolve({ id: booked.leadId }),
    });
    expect(detail.status).toBe(200);
    const metrics = await metricsGet(new Request('http://127.0.0.1:3000/api/metrics'));
    const metricBody = (await metrics.json()) as {
      sampleCount: number;
      channels: { channel: string; p50: number | null }[];
    };
    expect(metricBody.sampleCount).toBeGreaterThan(0);
    expect(metricBody.channels.find((row) => row.channel === 'web')?.p50).not.toBeNull();
  });

  it('rejects a bad Twilio signature, replays a duplicate, and rate limits', async () => {
    const bad = await smsPost(smsRequest('Hello from sms', 'SM-bad', 'not-a-signature'));
    expect(bad.status).toBe(401);
    const ok = await smsPost(
      smsRequest('Looking for a 2 bedroom condo in Glassmarket around 500k, just looking', 'SM-ok'),
    );
    expect(ok.status).toBe(200);
    const again = await smsPost(
      smsRequest('Looking for a 2 bedroom condo in Glassmarket around 500k, just looking', 'SM-ok'),
    );
    expect(again.headers.get('idempotent-replay')).toBe('true');
    const leads = await getContainer().repo.listLeads();
    expect(await getContainer().repo.listMessages(leads[0]?.conversationId ?? '')).toHaveLength(2);
    process.env.RATE_LIMIT_MAX = '1';
    const limited = await smsPost(smsRequest('Another note from a lead', 'SM-limit'));
    expect(limited.status).toBe(429);
  });

  it('verifies Meta and email payloads and leaves voice unexecuted', async () => {
    const challenge = instagramGet(
      new Request(
        'http://127.0.0.1:3000/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=test-meta-verify&hub.challenge=chal-1',
      ),
    );
    expect(await challenge.text()).toBe('chal-1');
    const raw = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'ig-9' },
              recipient: { id: 'page' },
              message: {
                mid: 'mid-9',
                text: 'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.',
              },
            },
          ],
        },
      ],
    });
    const ig = await instagramPost(
      new Request('http://127.0.0.1:3000/api/webhooks/instagram', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-hub-signature-256': metaSignature(raw, 'test-meta-secret'),
        },
        body: raw,
      }),
    );
    expect(ig.status).toBe(200);
    const emailRaw = JSON.stringify({
      messageId: 'email-1',
      from: 'lead@example.com',
      to: 'desk@harborline.test',
      subject: 'Home',
      text: 'Hello',
    });
    process.env.EMAIL_WEBHOOK_SECRET = 'email-secret';
    const email = await emailPost(
      new Request('http://127.0.0.1:3000/api/webhooks/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-harborline-signature': emailSignature(emailRaw, 'email-secret'),
        },
        body: emailRaw,
      }),
    );
    expect(email.status).toBe(200);
    delete process.env.EMAIL_WEBHOOK_SECRET;
    const invalid = await emailPost(
      new Request('http://127.0.0.1:3000/api/webhooks/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{',
      }),
    );
    expect(invalid.status).toBe(400);
    const before = (await getContainer().repo.listAppointments()).length;
    const voice = await voicePost(
      new Request('http://127.0.0.1:3000/api/webhooks/voice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          callId: 'call-1',
          tool: { name: 'qualify_lead', arguments: { beds: 3, area: 'Lantern Hill' } },
        }),
      }),
    );
    const voiceBody = (await voice.json()) as { live: boolean; executed: boolean };
    expect(voiceBody.live).toBe(false);
    expect(voiceBody.executed).toBe(false);
    expect(await getContainer().repo.listAppointments()).toHaveLength(before);
    const voiceInfo = await voiceGet(new Request('http://127.0.0.1:3000/api/webhooks/voice'));
    expect((await voiceInfo.json()) as { live: boolean }).toMatchObject({ live: false });
  });

  it('dispatches a signed simulator payload', async () => {
    const response = await dispatchPost(
      new Request('http://127.0.0.1:3000/api/simulator/dispatch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel: 'sms',
          text: 'Looking for a 3 bedroom condo in Lantern Hill under $700k within 30 days.',
          externalUserId: '+15550100001',
          externalMessageId: 'SM-sim-1',
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mode: string; reply: string };
    expect(body.mode).toBe('offline');
    expect(body.reply.length).toBeGreaterThan(10);
  });

  it('falls back to offline when OpenAI fails and says so', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    const response = await chatPost(
      new Request('http://127.0.0.1:3000/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'I want a condo', idempotencyKey: 'fallback-key-01' }),
      }),
    );
    const body = (await response.json()) as { mode: string };
    expect(body.mode).toBe('offline_fallback');
  });

  it('returns 404 for an unknown lead', async () => {
    const response = await leadGet(new Request('http://127.0.0.1:3000/api/leads/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(response.status).toBe(404);
  });
});
