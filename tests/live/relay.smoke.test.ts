import { describe, expect, it } from 'vitest';

import { createRelayClient } from '@/adapters/relay/client';
import { runWithClientIp } from '@/server/request-context';

const liveUrl = process.env.LLM_RELAY_URL;
const liveToken = process.env.LLM_RELAY_TOKEN;

describe.skipIf(!liveUrl || !liveToken)('relay live smoke', () => {
  it('gets a model reply, stores a document, and rejects a second reserve', async () => {
    process.env.LLM_RELAY_URL = liveUrl;
    process.env.LLM_RELAY_TOKEN = liveToken;
    const client = createRelayClient();
    expect(client).not.toBeNull();
    if (!client) return;
    const stamp = Date.now().toString();
    const eventId = `smoke.event.${stamp}`;
    const slotKey = `smoke-slot-${stamp}`;
    const firstId = `smoke.appt.${stamp}.a`;
    const secondId = `smoke.appt.${stamp}.b`;
    await runWithClientIp('127.0.0.1', async () => {
      const chat = await client.chat({
        messages: [
          { role: 'system', content: 'Return JSON {"reply":"ok"} only.' },
          { role: 'user', content: 'Say ok.' },
        ],
      });
      expect(chat.content.length).toBeGreaterThan(0);
      await client.put('events', eventId, { type: 'smoke', at: new Date().toISOString() });
      const stored = await client.get<{ type: string }>('events', eventId);
      expect(stored?.type).toBe('smoke');
      await client.reserve(firstId, { slot_key: slotKey, status: 'booked' });
      await expect(
        client.reserve(secondId, { slot_key: slotKey, status: 'booked' }),
      ).rejects.toMatchObject({ code: 'slot_taken' });
      await client.put('appointments', firstId, {
        id: firstId,
        slotId: slotKey,
        slot_key: slotKey,
        leadId: 'smoke',
        conversationId: 'smoke',
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        timezone: 'UTC',
        status: 'cancelled',
      });
      await client.delete('events', eventId);
    });
  }, 25_000);
});
