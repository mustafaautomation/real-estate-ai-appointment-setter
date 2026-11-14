import { parseEmail } from '@/adapters/channels/parse';
import { verifyEmail } from '@/adapters/http/signatures';
import { AppError } from '@/domain/errors';
import { guarded, publicResult, withIdempotency } from '@/server/finish';
import { acceptInbound } from '@/server/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'email', async (requestId) => {
    const raw = await request.text();
    if (!verifyEmail(raw, request.headers.get('x-harborline-signature'))) {
      throw new AppError('invalid_signature', 'Email signature did not match', 401);
    }
    const inbound = parseEmail(JSON.parse(raw) as unknown);
    return withIdempotency(
      requestId,
      `email:${inbound.externalMessageId}`,
      'application/json; charset=utf-8',
      async () => {
        const result = await acceptInbound({ ...inbound, requestId });
        return JSON.stringify({
          channel: 'email',
          to: inbound.externalUserId,
          subject: inbound.subject ? `Re: ${inbound.subject}` : 'Re: your note',
          ...publicResult(result),
        });
      },
    );
  });
}
