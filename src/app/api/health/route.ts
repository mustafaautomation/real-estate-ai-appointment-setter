import { configuredLlmMode } from '@/adapters/llm/model';
import { json, requestIdOf } from '@/adapters/http/respond';
import { getContainer } from '@/server/container';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): Response {
  const requestId = requestIdOf(request);
  const container = getContainer();
  return json(
    {
      ok: true,
      llm: configuredLlmMode(),
      storage: container.storage,
      calendar: container.calendarName,
      voice: 'stub',
      timezone: container.timeZone,
    },
    200,
    requestId,
  );
}
