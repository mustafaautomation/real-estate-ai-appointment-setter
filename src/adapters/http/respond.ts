import { ZodError } from 'zod';

import { AppError } from '@/domain/errors';
import { createLogger, type Logger } from '@/adapters/logging/logger';

const logger: Logger = createLogger();

export function requestIdOf(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  if (incoming && /^[A-Za-z0-9_-]{8,80}$/.test(incoming)) return incoming;
  return crypto.randomUUID();
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first) return first;
  const real = request.headers.get('x-real-ip')?.trim();
  return real || 'local';
}

export function json(
  body: unknown,
  status: number,
  requestId: string,
  extra?: HeadersInit,
): Response {
  const headers = new Headers(extra);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-request-id', requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(error: unknown, requestId: string): Response {
  if (error instanceof ZodError || error instanceof SyntaxError) {
    return json(
      { error: { code: 'invalid_input', message: 'Invalid payload', requestId } },
      400,
      requestId,
    );
  }
  if (error instanceof AppError) {
    logger.warn('request.rejected', { requestId, code: error.code, status: error.status });
    return json(
      { error: { code: error.code, message: error.message, requestId } },
      error.status,
      requestId,
    );
  }
  logger.error('request.failed', {
    requestId,
    name: error instanceof Error ? error.name : 'Error',
  });
  return json(
    { error: { code: 'internal', message: 'Unexpected error', requestId } },
    500,
    requestId,
  );
}

export function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
