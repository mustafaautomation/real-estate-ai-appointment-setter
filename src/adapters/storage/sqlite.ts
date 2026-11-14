import { DatabaseSync } from 'node:sqlite';

import type { SqlExecutor } from './schema';
import { SCHEMA } from './schema';

export class SqliteExecutor implements SqlExecutor {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec(SCHEMA);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: readonly (string | number | null)[] = []): { changes: number } {
    const result = this.db.prepare(sql).run(...params);
    return { changes: Number(result.changes) };
  }

  get<T extends Record<string, unknown>>(
    sql: string,
    params: readonly (string | number | null)[] = [],
  ): T | undefined {
    const row = this.db.prepare(sql).get(...params);
    return row as T | undefined;
  }

  all<T extends Record<string, unknown>>(
    sql: string,
    params: readonly (string | number | null)[] = [],
  ): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}

/** Atomic slot claim. The second caller gets changes = 0 when the row is no longer open. */
export function claimSlot(executor: SqlExecutor, slotId: string): boolean {
  executor.run('INSERT INTO slot_claims (id, state) VALUES (?, ?) ON CONFLICT(id) DO NOTHING', [
    slotId,
    'open',
  ]);
  const result = executor.run(
    "UPDATE slot_claims SET state = 'booked' WHERE id = ? AND state = 'open'",
    [slotId],
  );
  return result.changes === 1;
}
