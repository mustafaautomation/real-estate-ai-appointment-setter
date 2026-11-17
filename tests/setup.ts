import { beforeEach } from 'vitest';

import { resetContainer } from '@/server/container';

process.env.TWILIO_AUTH_TOKEN = 'test-twilio-token';
process.env.META_APP_SECRET = 'test-meta-secret';
process.env.META_VERIFY_TOKEN = 'test-meta-verify';
process.env.STORAGE_DRIVER = 'memory';
process.env.CALENDAR_PROVIDER = 'memory';
process.env.RATE_LIMIT_MAX = '60';
delete process.env.OPENAI_API_KEY;
delete process.env.LLM_RELAY_URL;
delete process.env.LLM_RELAY_TOKEN;
delete process.env.EMAIL_WEBHOOK_SECRET;
delete process.env.APP_BASE_URL;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.LLM_RELAY_URL;
  delete process.env.LLM_RELAY_TOKEN;
  delete process.env.EMAIL_WEBHOOK_SECRET;
  process.env.RATE_LIMIT_MAX = '60';
  resetContainer();
});
