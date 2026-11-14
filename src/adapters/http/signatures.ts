import { createHmac, timingSafeEqual } from 'node:crypto';

import { AppError } from '@/domain/errors';

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function twilioSignature(
  url: string,
  params: Record<string, string>,
  token: string,
): string {
  const keys = Object.keys(params).sort();
  let data = url;
  for (const key of keys) data += key + (params[key] ?? '');
  return createHmac('sha1', token).update(data).digest('base64');
}

export function verifyTwilio(
  url: string,
  params: Record<string, string>,
  token: string,
  signature: string | null,
): boolean {
  if (!signature) return false;
  return safeEqual(twilioSignature(url, params, token), signature);
}

export function metaSignature(rawBody: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyMeta(rawBody: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  return safeEqual(metaSignature(rawBody, secret), signature);
}

export function emailSignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyEmail(rawBody: string, signature: string | null): boolean {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  return safeEqual(emailSignature(rawBody, secret), signature);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new AppError('not_configured', `${name} is not set`, 401);
  return value;
}

export function signatureUrl(request: Request): string {
  const base = process.env.APP_BASE_URL;
  if (base) {
    const incoming = new URL(request.url);
    return `${base.replace(/\/$/, '')}${incoming.pathname}${incoming.search}`;
  }
  return request.url;
}

export function formParams(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const output: Record<string, string> = {};
  for (const [key, value] of params.entries()) output[key] = value;
  return output;
}
