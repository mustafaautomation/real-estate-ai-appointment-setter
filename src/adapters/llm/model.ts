import { LlmError } from '@/domain/errors';
import type { ReplyMode } from '@/domain/types';

export type RephraseInput = {
  draft: string;
  facts: string[];
};

export interface ReplyModel {
  readonly id: 'offline' | 'openai';
  rephrase(input: RephraseInput): Promise<string>;
}

export class OfflineReplyModel implements ReplyModel {
  readonly id = 'offline' as const;

  async rephrase(input: RephraseInput): Promise<string> {
    return input.draft;
  }
}

export class OpenAiReplyModel implements ReplyModel {
  readonly id = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    private readonly modelName: string,
    private readonly timeoutMs: number,
    private readonly retries: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async rephrase(input: RephraseInput): Promise<string> {
    let last: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (attempt > 0) await delay(200 * 2 ** (attempt - 1));
      try {
        const response = await this.fetchImpl('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: {
            authorization: `Bearer ${this.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: this.modelName,
            temperature: 0.4,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'Rewrite the draft as a short natural reply for a real estate desk. Keep every fact in the facts list. Do not add homes, prices, times, or promises that are not in the draft. Do not give legal, financial, or fair-housing steering. Return JSON {"reply":"..."} only.',
              },
              {
                role: 'user',
                content: JSON.stringify({ draft: input.draft, facts: input.facts }),
              },
            ],
          }),
        });
        if (!response.ok) throw new LlmError(`OpenAI status ${response.status}`);
        const payload: unknown = await response.json();
        const content = readContent(payload);
        const parsed = JSON.parse(content) as { reply?: unknown };
        if (typeof parsed.reply !== 'string' || parsed.reply.trim().length < 8) {
          throw new LlmError('OpenAI reply was empty');
        }
        if (!keepsFacts(parsed.reply, input.facts))
          throw new LlmError('OpenAI reply dropped facts');
        return parsed.reply.trim();
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new LlmError('OpenAI request failed');
  }
}

export function createReplyModel(env: NodeJS.ProcessEnv = process.env): ReplyModel {
  const key = env.OPENAI_API_KEY;
  if (!key) return new OfflineReplyModel();
  return new OpenAiReplyModel(
    key,
    env.OPENAI_MODEL || 'gpt-4o-mini',
    Number(env.LLM_TIMEOUT_MS ?? 8000),
    Number(env.LLM_RETRIES ?? 2),
  );
}

export function configuredLlmMode(
  env: NodeJS.ProcessEnv = process.env,
): 'offline' | 'openai' | 'relay' {
  if (env.LLM_RELAY_URL?.trim() && env.LLM_RELAY_TOKEN?.trim()) return 'relay';
  return env.OPENAI_API_KEY ? 'openai' : 'offline';
}

export function acceptRephrase(reply: string, draft: string, facts: string[]): boolean {
  if (reply.trim().length < 8) return false;
  return keepsFacts(reply, facts.length > 0 ? facts : [draft.slice(0, 24)]);
}

function keepsFacts(reply: string, facts: string[]): boolean {
  const haystack = reply.toLowerCase();
  return facts.every((fact) => fact.length < 3 || haystack.includes(fact.toLowerCase()));
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object')
    throw new LlmError('OpenAI payload was not an object');
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    throw new LlmError('OpenAI payload had no choices');
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  if (!message || typeof message.content !== 'string')
    throw new LlmError('OpenAI payload had no content');
  return message.content;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function modeAfterModel(modelId: ReplyModel['id'], usedFallback: boolean): ReplyMode {
  if (modelId === 'offline') return 'offline';
  return usedFallback ? 'offline_fallback' : 'openai';
}
