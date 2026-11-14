import { simulatorSchema } from '@/adapters/channels/parse';
import {
  emailSignature,
  metaSignature,
  requireEnv,
  twilioSignature,
} from '@/adapters/http/signatures';
import { POST as emailPost } from '@/app/api/webhooks/email/route';
import { POST as instagramPost } from '@/app/api/webhooks/instagram/route';
import { POST as smsPost } from '@/app/api/webhooks/sms/route';
import { guarded } from '@/server/finish';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'simulator', async () => {
    const body = simulatorSchema.parse(await request.json());
    const messageId = body.externalMessageId ?? `sim_${crypto.randomUUID()}`;
    if (body.channel === 'sms')
      return smsPost(smsRequest(body.externalUserId, messageId, body.text));
    if (body.channel === 'email')
      return emailPost(emailRequest(body.externalUserId, messageId, body.text));
    return instagramPost(instagramRequest(body.externalUserId, messageId, body.text));
  });
}

function smsRequest(from: string, messageId: string, text: string): Request {
  const url = 'http://127.0.0.1:3000/api/webhooks/sms';
  const params = {
    MessageSid: messageId,
    From: from,
    To: '+15557654321',
    Body: text,
    AccountSid: 'ACdemo',
  };
  const token = requireEnv('TWILIO_AUTH_TOKEN');
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': twilioSignature(url, params, token),
      'x-harborline-response': 'json',
    },
    body: new URLSearchParams(params).toString(),
  });
}

function emailRequest(from: string, messageId: string, text: string): Request {
  const url = 'http://127.0.0.1:3000/api/webhooks/email';
  const raw = JSON.stringify({
    messageId,
    from,
    to: 'desk@harborline.test',
    subject: 'New lead',
    text,
  });
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.EMAIL_WEBHOOK_SECRET) {
    headers['x-harborline-signature'] = emailSignature(raw, process.env.EMAIL_WEBHOOK_SECRET);
  }
  return new Request(url, { method: 'POST', headers, body: raw });
}

function instagramRequest(sender: string, messageId: string, text: string): Request {
  const url = 'http://127.0.0.1:3000/api/webhooks/instagram';
  const raw = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: 'page-demo',
        messaging: [
          {
            sender: { id: sender },
            recipient: { id: 'harborline-page' },
            timestamp: Date.now(),
            message: { mid: messageId, text },
          },
        ],
      },
    ],
  });
  const secret = requireEnv('META_APP_SECRET');
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': metaSignature(raw, secret),
    },
    body: raw,
  });
}
