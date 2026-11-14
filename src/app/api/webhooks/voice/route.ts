import { voiceToolSchema } from '@/adapters/channels/parse';
import { guarded } from '@/server/finish';
import { json } from '@/adapters/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  return json(
    {
      live: false,
      mode: 'stub',
      tools: ['qualify_lead', 'book_appointment'],
      message: 'Voice is not live. POST a tool call to validate it. Nothing is booked.',
    },
    200,
    request.headers.get('x-request-id') ?? crypto.randomUUID(),
  );
}

export function POST(request: Request): Promise<Response> {
  return guarded(request, 'voice', async (requestId) => {
    const body = voiceToolSchema.parse(await request.json());
    return json(
      {
        live: false,
        mode: 'stub',
        validated: true,
        executed: false,
        callId: body.callId,
        tool: body.tool.name,
        message: 'Voice is not live. The tool call was validated and was not executed.',
      },
      200,
      requestId,
    );
  });
}
