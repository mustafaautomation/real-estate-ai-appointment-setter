import { AsyncLocalStorage } from 'node:async_hooks';

const clientIp = new AsyncLocalStorage<string>();

export function runWithClientIp<T>(ip: string, fn: () => T): T {
  const value = ip.trim();
  return clientIp.run(value.length > 0 ? value : 'local', fn);
}

export function currentClientIp(): string {
  return clientIp.getStore() ?? 'local';
}
