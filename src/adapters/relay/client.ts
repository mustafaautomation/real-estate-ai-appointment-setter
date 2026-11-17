import { createHash } from 'node:crypto';

import { SlotTakenError } from '@/domain/errors';
import { currentClientIp } from '@/server/request-context';
import { RELAY_TIMEOUT_MS } from '@/server/limits';

const ID_PATTERN = /^[A-Za-z0-9._:@-]{1,128}$/;
const MAX_DOC_BYTES = 64_000;

export type RelayCollection = 'leads' | 'conversations' | 'messages' | 'appointments' | 'events';

export type StoredDoc<T> = {
  collection: string;
  id: string;
  data: T;
  created_at: number;
  updated_at: number;
};

export class RelayHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly path: string;

  constructor(status: number, code: string, path = '') {
    super(code);
    this.name = 'RelayHttpError';
    this.status = status;
    this.code = code;
    this.path = path;
  }
}

export function relayBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/v1\/chat$/, '');
}

export function relayConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.LLM_RELAY_URL?.trim() && env.LLM_RELAY_TOKEN?.trim());
}

export function storeId(value: string): string {
  if (ID_PATTERN.test(value)) return value;
  return `id.${createHash('sha256').update(value).digest('hex').slice(0, 40)}`;
}

export function isRelayFallback(error: unknown): boolean {
  if (error instanceof RelayHttpError) {
    return error.status === 429 || error.status === 502 || error.code === 'bad_model_payload';
  }
  if (error instanceof SyntaxError) return true;
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return true;
  }
  return false;
}

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class RelayClient {
  readonly baseUrl: string;

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = RELAY_TIMEOUT_MS,
  ) {
    this.baseUrl = relayBaseUrl(url);
  }

  async chat(input: {
    messages: ChatMessage[];
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: { type: 'json_object' } | { type: 'json_schema'; json_schema: unknown };
  }): Promise<{ content: string; model: string | null; latencyMs: number | null }> {
    const body: Record<string, unknown> = {
      messages: input.messages,
      max_tokens: Math.min(600, input.maxTokens ?? 500),
      temperature: input.temperature ?? 0.2,
      response_format: input.responseFormat ?? { type: 'json_object' },
    };
    if (input.model) body.model = input.model;
    const payload = await this.request<{
      content?: unknown;
      model?: unknown;
      latency_ms?: unknown;
    }>('/v1/chat', {
      method: 'POST',
      body,
    });
    if (typeof payload.content !== 'string' || payload.content.trim().length === 0) {
      throw new RelayHttpError(502, 'bad_model_payload', '/v1/chat');
    }
    return {
      content: payload.content,
      model: typeof payload.model === 'string' ? payload.model : null,
      latencyMs: typeof payload.latency_ms === 'number' ? payload.latency_ms : null,
    };
  }

  async put<T extends object>(collection: RelayCollection, id: string, data: T): Promise<void> {
    const body = JSON.stringify(data);
    if (body.length > MAX_DOC_BYTES) throw new RelayHttpError(413, 'doc_too_large');
    await this.request(`/v1/store/${collection}/${storeId(id)}`, {
      method: 'PUT',
      body: data,
    });
  }

  async get<T>(collection: RelayCollection, id: string): Promise<T | null> {
    const response = await this.send(`/v1/store/${collection}/${storeId(id)}`, { method: 'GET' });
    if (response.status === 404) return null;
    const payload: unknown = await readJson(response);
    if (!response.ok) {
      throw new RelayHttpError(
        response.status,
        errorCode(payload, response.status),
        `GET /v1/store/${collection}`,
      );
    }
    return unwrapData<T>(payload);
  }

  async delete(collection: RelayCollection, id: string): Promise<void> {
    const response = await this.send(`/v1/store/${collection}/${storeId(id)}`, {
      method: 'DELETE',
    });
    if (response.status === 404) return;
    if (!response.ok) {
      const payload: unknown = await readJson(response);
      throw new RelayHttpError(
        response.status,
        errorCode(payload, response.status),
        `/v1/store/${collection}`,
      );
    }
  }

  async list<T>(
    collection: RelayCollection,
    query: { limit?: number; filterKey?: string; filterValue?: string } = {},
  ): Promise<T[]> {
    const rows: T[] = [];
    let cursor: string | null = null;
    for (let pageNumber = 0; pageNumber < 5; pageNumber += 1) {
      const params = new URLSearchParams();
      params.set('limit', String(query.limit ?? 50));
      if (cursor) params.set('cursor', cursor);
      if (query.filterKey && query.filterValue !== undefined) {
        params.set('filter_key', query.filterKey);
        params.set('filter_value', query.filterValue);
      }
      const response = await this.send(`/v1/store/${collection}?${params.toString()}`, {
        method: 'GET',
      });
      if (response.status === 404) return rows;
      const payload = (await readJson(response)) as {
        items?: unknown;
        next_cursor?: unknown;
      } | null;
      if (!response.ok) {
        throw new RelayHttpError(
          response.status,
          errorCode(payload, response.status),
          `/v1/store/${collection}`,
        );
      }
      const body = payload ?? {};
      const items = Array.isArray(body.items) ? body.items : [];
      for (const item of items) {
        const data = unwrapData<T>(item);
        if (data) rows.push(data);
      }
      cursor = typeof body.next_cursor === 'string' && body.next_cursor ? body.next_cursor : null;
      if (!cursor || items.length === 0) break;
    }
    return rows;
  }

  async reserve(id: string, data: { slot_key: string } & Record<string, unknown>): Promise<void> {
    const response = await this.send(`/v1/store/appointments/${storeId(id)}/reserve`, {
      method: 'POST',
      body: data,
    });
    const payload: unknown = await readJson(response);
    if (response.status === 409 || errorCode(payload, response.status) === 'slot_taken') {
      throw new SlotTakenError(data.slot_key);
    }
    if (response.status !== 201 && !response.ok) {
      throw new RelayHttpError(
        response.status,
        errorCode(payload, response.status),
        '/v1/store/appointments',
      );
    }
  }

  private async request<T>(path: string, init: { method: string; body?: unknown }): Promise<T> {
    const response = await this.send(path, init);
    const payload: unknown = await readJson(response);
    if (!response.ok) {
      throw new RelayHttpError(
        response.status,
        errorCode(payload, response.status),
        `${init.method} ${path}`,
      );
    }
    return payload as T;
  }

  private async send(path: string, init: { method: string; body?: unknown }): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method,
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
        'x-client-ip': currentClientIp(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  }
}

export function createRelayClient(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): RelayClient | null {
  const url = env.LLM_RELAY_URL?.trim();
  const token = env.LLM_RELAY_TOKEN?.trim();
  if (!url || !token) return null;
  const timeout = Number(env.LLM_TIMEOUT_MS ?? RELAY_TIMEOUT_MS);
  return new RelayClient(
    url,
    token,
    fetchImpl,
    Number.isFinite(timeout) ? timeout : RELAY_TIMEOUT_MS,
  );
}

function unwrapData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null;
  if ('data' in payload) {
    const data = (payload as { data?: unknown }).data;
    if (data && typeof data === 'object') return data as T;
    return null;
  }
  return payload as T;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorCode(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === 'string') return error;
    if (
      error &&
      typeof error === 'object' &&
      typeof (error as { code?: unknown }).code === 'string'
    ) {
      return (error as { code: string }).code;
    }
  }
  return `http_${status}`;
}
