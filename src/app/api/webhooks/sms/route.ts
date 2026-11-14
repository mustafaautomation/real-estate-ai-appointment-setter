import { parseSms } from '@/adapters/channels/parse';
import { formParams, requireEnv, signatureUrl, verifyTwilio } from '@/adapters/http/signatures';
import { AppError } from '@/domain/errors';
import { xmlEscape } from '@/adapters/http/respond';
import { acceptInbound } from '@/server/inbound';
import { guarded, publicResult, wantsJson, withIdempotency } from '@/server/finish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'sms', async (requestId) => {
    const raw = await request.text();
    const params = formParams(raw);
    const token = requireEnv('TWILIO_AUTH_TOKEN');
    if (
      !verifyTwilio(signatureUrl(request), params, token, request.headers.get('x-twilio-signature'))
    ) {
      throw new AppError('invalid_signature', 'Twilio signature did not match', 401);
    }
    const inbound = parseSms(params);
    const asJson = wantsJson(request);
    const contentType = asJson ? 'application/json; charset=utf-8' : 'text/xml; charset=utf-8';
    return withIdempotency(requestId, `sms:${inbound.externalMessageId}`, contentType, async () => {
      const result = await acceptInbound({ ...inbound, requestId });
      if (asJson) return JSON.stringify({ channel: 'sms', ...publicResult(result) });
      return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(result.reply)}</Message></Response>`;
    });
  });
}
