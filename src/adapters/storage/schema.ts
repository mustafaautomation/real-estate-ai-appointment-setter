export const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  data TEXT NOT NULL,
  UNIQUE (channel, external_user_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS latencies (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS slot_claims (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL
);
`;

export type SqlExecutor = {
  exec(sql: string): void;
  run(sql: string, params?: readonly (string | number | null)[]): { changes: number };
  get<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly (string | number | null)[],
  ): T | undefined;
  all<T extends Record<string, unknown>>(
    sql: string,
    params?: readonly (string | number | null)[],
  ): T[];
};
