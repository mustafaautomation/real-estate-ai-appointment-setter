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

import { RelayClient, storeId } from './client';

type LatencyEvent = LatencySample & { type: 'latency' };
type IdempotencyEvent = IdempotencyRecord & { type: 'idempotency' };

export class RelayRepository implements LeadRepository {
  constructor(private readonly client: RelayClient) {}

  async upsertLead(lead: Lead): Promise<void> {
    await this.client.put('leads', lead.id, lead);
  }

  async getLead(id: string): Promise<Lead | null> {
    return this.client.get<Lead>('leads', id);
  }

  async listLeads(): Promise<Lead[]> {
    const leads = await this.client.list<Lead>('leads', { limit: 100 });
    return leads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async upsertConversation(conversation: Conversation): Promise<void> {
    await this.client.put('conversations', conversation.id, conversation);
  }

  async getConversation(id: string): Promise<Conversation | null> {
    return this.client.get<Conversation>('conversations', id);
  }

  async findConversation(channel: Channel, externalUserId: string): Promise<Conversation | null> {
    const rows = await this.client.list<Conversation>('conversations', {
      limit: 20,
      filterKey: 'externalUserId',
      filterValue: externalUserId,
    });
    return (
      rows.find((row) => row.channel === channel && row.externalUserId === externalUserId) ?? null
    );
  }

  async addMessage(message: StoredMessage): Promise<void> {
    await this.client.put('messages', message.id, message);
    if (message.role === 'assistant') {
      await this.client.put('events', storeId(`turn.${message.id}`), {
        type: 'turn',
        conversationId: message.conversationId,
        mode: message.mode ?? null,
        at: message.createdAt,
      });
    }
  }

  async listMessages(conversationId: string): Promise<StoredMessage[]> {
    const rows = await this.client.list<StoredMessage>('messages', {
      limit: 100,
      filterKey: 'conversationId',
      filterValue: conversationId,
    });
    return rows
      .filter((row) => row.conversationId === conversationId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertAppointment(appointment: Appointment): Promise<void> {
    await this.client.put('appointments', appointment.id, {
      ...appointment,
      slot_key: appointment.slotId,
    });
  }

  async listAppointments(): Promise<Appointment[]> {
    return this.client.list<Appointment>('appointments', { limit: 100 });
  }

  async getIdempotency(key: string): Promise<IdempotencyRecord | null> {
    const row = await this.client.get<IdempotencyEvent>('events', idempotencyId(key));
    return row ? stripType(row) : null;
  }

  async claimIdempotency(record: IdempotencyRecord): Promise<IdempotencyRecord | null> {
    const existing = await this.getIdempotency(record.key);
    if (existing) return existing;
    await this.client.put('events', idempotencyId(record.key), { ...record, type: 'idempotency' });
    return null;
  }

  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    await this.client.put('events', idempotencyId(record.key), { ...record, type: 'idempotency' });
  }

  async deleteIdempotency(key: string): Promise<void> {
    await this.client.delete('events', idempotencyId(key));
  }

  async addLatency(sample: LatencySample): Promise<void> {
    await this.client.put('events', storeId(`latency.${sample.id}`), {
      ...sample,
      type: 'latency',
    });
  }

  async listLatencies(): Promise<LatencySample[]> {
    const rows = await this.client.list<LatencyEvent>('events', { limit: 100 });
    return rows.filter((row) => row.type === 'latency').map((row) => stripType(row));
  }
}

function idempotencyId(key: string): string {
  return storeId(`idem.${key}`);
}

function stripType<T extends { type: string }>(row: T): Omit<T, 'type'> {
  const { type: _type, ...rest } = row;
  return rest;
}
