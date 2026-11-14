import { parseInstagram } from '@/adapters/channels/parse';
import { requireEnv, verifyMeta } from '@/adapters/http/signatures';
import { json } from '@/adapters/http/respond';
import { AppError } from '@/domain/errors';
import { acceptInbound } from '@/server/inbound';
import { guarded, publicResult, withIdempotency } from '@/server/finish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.META_VERIFY_TOKEN;
  if (!expected) {
    return json(
      { error: { code: 'not_configured', message: 'META_VERIFY_TOKEN is not set', requestId } },
      401,
      requestId,
    );
  }
  if (mode === 'subscribe' && token === expected && challenge) {
    return new Response(challenge, {
      status: 200,
      headers: { 'content-type': 'text/plain', 'x-request-id': requestId },
    });
  }
  return json(
    { error: { code: 'forbidden', message: 'Verify token did not match', requestId } },
    403,
    requestId,
  );
}

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'instagram', async (requestId) => {
    const raw = await request.text();
    const secret = requireEnv('META_APP_SECRET');
    if (!verifyMeta(raw, secret, request.headers.get('x-hub-signature-256'))) {
      throw new AppError('invalid_signature', 'Meta signature did not match', 401);
    }
    const inbound = parseInstagram(JSON.parse(raw) as unknown);
    return withIdempotency(
      requestId,
      `instagram:${inbound.externalMessageId}`,
      'application/json; charset=utf-8',
      async () => {
        const result = await acceptInbound({ ...inbound, requestId });
        return JSON.stringify({
          channel: 'instagram',
          recipient: { id: inbound.externalUserId },
          message: { text: result.reply },
          ...publicResult(result),
        });
      },
    );
  });
}
