export const MAX_MESSAGE_CHARS = 2_000;
export const MAX_TURNS = 24;
export const RELAY_TIMEOUT_MS = 8_000;

export function tooLongMessage(): string {
  return `That note is longer than ${MAX_MESSAGE_CHARS.toLocaleString('en-US')} characters. Send a shorter one.`;
}

export function turnLimitMessage(): string {
  return `This conversation has reached ${MAX_TURNS} turns. A person can continue it from here.`;
}

export function rateLimitMessage(): string {
  return 'Too many messages just now. Wait a minute and send that again.';
}
