import type {
  Appointment,
  Channel,
  Conversation,
  IdempotencyRecord,
  LatencySample,
  Lead,
  LeadRepository,
  StoredMessage,
} from '@/domain/types';

import type { SqlExecutor } from './schema';

export class SqlRepository implements LeadRepository {
  constructor(private readonly sql: SqlExecutor) {}

  upsertLead(lead: Lead): void {
    this.sql.run(
      'INSERT INTO leads (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      [lead.id, JSON.stringify(lead)],
    );
  }

  getLead(id: string): Lead | null {
    return this.one<Lead>('SELECT data FROM leads WHERE id = ?', [id]);
  }

  listLeads(): Lead[] {
    return this.many<Lead>('SELECT data FROM leads').sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  upsertConversation(conversation: Conversation): void {
    this.sql.run(
      `INSERT INTO conversations (id, channel, external_user_id, data)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET channel = excluded.channel, external_user_id = excluded.external_user_id, data = excluded.data`,
      [
        conversation.id,
        conversation.channel,
        conversation.externalUserId,
        JSON.stringify(conversation),
      ],
    );
  }

  getConversation(id: string): Conversation | null {
    return this.one<Conversation>('SELECT data FROM conversations WHERE id = ?', [id]);
  }

  findConversation(channel: Channel, externalUserId: string): Conversation | null {
    return this.one<Conversation>(
      'SELECT data FROM conversations WHERE channel = ? AND external_user_id = ?',
      [channel, externalUserId],
    );
  }

  addMessage(message: StoredMessage): void {
    this.sql.run('INSERT INTO messages (id, conversation_id, data) VALUES (?, ?, ?)', [
      message.id,
      message.conversationId,
      JSON.stringify(message),
    ]);
  }

  listMessages(conversationId: string): StoredMessage[] {
    return this.many<StoredMessage>('SELECT data FROM messages WHERE conversation_id = ?', [
      conversationId,
    ]);
  }

  upsertAppointment(appointment: Appointment): void {
    this.sql.run(
      'INSERT INTO appointments (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data',
      [appointment.id, JSON.stringify(appointment)],
    );
  }

  listAppointments(): Appointment[] {
    return this.many<Appointment>('SELECT data FROM appointments');
  }

  getIdempotency(key: string): IdempotencyRecord | null {
    return this.one<IdempotencyRecord>('SELECT data FROM idempotency WHERE key = ?', [key]);
  }

  claimIdempotency(record: IdempotencyRecord): IdempotencyRecord | null {
    const inserted = this.sql.run(
      'INSERT INTO idempotency (key, data) VALUES (?, ?) ON CONFLICT(key) DO NOTHING',
      [record.key, JSON.stringify(record)],
    );
    if (inserted.changes === 1) return null;
    return this.getIdempotency(record.key);
  }

  saveIdempotency(record: IdempotencyRecord): void {
    this.sql.run(
      'INSERT INTO idempotency (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data',
      [record.key, JSON.stringify(record)],
    );
  }

  deleteIdempotency(key: string): void {
    this.sql.run('DELETE FROM idempotency WHERE key = ?', [key]);
  }

  addLatency(sample: LatencySample): void {
    this.sql.run('INSERT INTO latencies (id, channel, data) VALUES (?, ?, ?)', [
      sample.id,
      sample.channel,
      JSON.stringify(sample),
    ]);
  }

  listLatencies(): LatencySample[] {
    return this.many<LatencySample>('SELECT data FROM latencies');
  }

  private one<T>(sql: string, params: readonly (string | number | null)[]): T | null {
    const row = this.sql.get<{ data: string }>(sql, params);
    if (!row) return null;
    return JSON.parse(row.data) as T;
  }

  private many<T>(sql: string, params: readonly (string | number | null)[] = []): T[] {
    return this.sql.all<{ data: string }>(sql, params).map((row) => JSON.parse(row.data) as T);
  }
}
