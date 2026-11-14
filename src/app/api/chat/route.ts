import { chatSchema } from '@/adapters/channels/parse';
import { guarded, publicResult, withIdempotency } from '@/server/finish';
import { acceptInbound } from '@/server/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'chat', async (requestId) => {
    const body = chatSchema.parse(await request.json());
    const key = `web:${body.idempotencyKey ?? crypto.randomUUID()}`;
    return withIdempotency(requestId, key, 'application/json; charset=utf-8', async () => {
      const result = await acceptInbound({
        channel: 'web',
        externalUserId: body.conversationId ?? key,
        externalMessageId: key,
        text: body.text,
        conversationId: body.conversationId,
        requestId,
      });
      return JSON.stringify(publicResult(result));
    });
  });
}
