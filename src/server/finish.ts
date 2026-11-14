import { allowRequest } from '@/adapters/http/rate-limit';
import { clientKey, errorResponse, json, requestIdOf } from '@/adapters/http/respond';
import type { IdempotencyRecord } from '@/domain/types';

import { getContainer } from './container';
import type { InboundResult } from './inbound';

export async function guarded(
  request: Request,
  bucket: string,
  run: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = requestIdOf(request);
  try {
    if (!allowRequest(`${bucket}:${clientKey(request)}`)) {
      return json(
        { error: { code: 'rate_limited', message: 'Too many requests', requestId } },
        429,
        requestId,
      );
    }
    return await run(requestId);
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function withIdempotency(
  requestId: string,
  key: string,
  contentType: string,
  produce: () => Promise<string>,
): Promise<Response> {
  const repo = getContainer().repo;
  const now = new Date().toISOString();
  const pending: IdempotencyRecord = { key, status: 0, contentType, body: '', createdAt: now };
  const existing = repo.claimIdempotency(pending);
  if (existing && existing.status === 0) {
    return json(
      { error: { code: 'in_progress', message: 'Duplicate request is in progress', requestId } },
      409,
      requestId,
    );
  }
  if (existing) {
    return new Response(existing.body, {
      status: existing.status,
      headers: {
        'content-type': existing.contentType,
        'x-request-id': requestId,
        'idempotent-replay': 'true',
      },
    });
  }
  try {
    const body = await produce();
    repo.saveIdempotency({ key, status: 200, contentType, body, createdAt: now });
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentType, 'x-request-id': requestId },
    });
  } catch (error) {
    repo.deleteIdempotency(key);
    throw error;
  }
}

export function wantsJson(request: Request): boolean {
  return (
    request.headers.get('x-harborline-response') === 'json' ||
    (request.headers.get('accept') ?? '').includes('application/json')
  );
}

export function publicResult(result: InboundResult) {
  return {
    reply: result.reply,
    mode: result.mode,
    conversationId: result.conversationId,
    leadId: result.leadId,
    stage: result.stage,
    slots: result.slots,
    score: result.score,
    listings: result.listings,
    appointment: result.appointment,
    guardrail: result.guardrail ?? null,
    transcript: result.transcript.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      mode: message.mode ?? null,
      latencyMs: message.latencyMs ?? null,
      createdAt: message.createdAt,
    })),
  };
}
