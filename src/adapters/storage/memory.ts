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

export class MemoryRepository implements LeadRepository {
  private readonly leads = new Map<string, Lead>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages: StoredMessage[] = [];
  private readonly appointments = new Map<string, Appointment>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();
  private readonly latencies: LatencySample[] = [];

  upsertLead(lead: Lead): void {
    this.leads.set(lead.id, structuredClone(lead));
  }

  getLead(id: string): Lead | null {
    const lead = this.leads.get(id);
    return lead ? structuredClone(lead) : null;
  }

  listLeads(): Lead[] {
    return [...this.leads.values()]
      .map((lead) => structuredClone(lead))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  upsertConversation(conversation: Conversation): void {
    this.conversations.set(conversation.id, structuredClone(conversation));
  }

  getConversation(id: string): Conversation | null {
    const conversation = this.conversations.get(id);
    return conversation ? structuredClone(conversation) : null;
  }

  findConversation(channel: Channel, externalUserId: string): Conversation | null {
    for (const conversation of this.conversations.values()) {
      if (conversation.channel === channel && conversation.externalUserId === externalUserId) {
        return structuredClone(conversation);
      }
    }
    return null;
  }

  addMessage(message: StoredMessage): void {
    this.messages.push(structuredClone(message));
  }

  listMessages(conversationId: string): StoredMessage[] {
    return this.messages
      .filter((message) => message.conversationId === conversationId)
      .map((message) => structuredClone(message));
  }

  upsertAppointment(appointment: Appointment): void {
    this.appointments.set(appointment.id, structuredClone(appointment));
  }

  listAppointments(): Appointment[] {
    return [...this.appointments.values()].map((appointment) => structuredClone(appointment));
  }

  getIdempotency(key: string): IdempotencyRecord | null {
    return this.idempotency.get(key) ?? null;
  }

  claimIdempotency(record: IdempotencyRecord): IdempotencyRecord | null {
    const existing = this.idempotency.get(record.key);
    if (existing) return existing;
    this.idempotency.set(record.key, record);
    return null;
  }

  saveIdempotency(record: IdempotencyRecord): void {
    this.idempotency.set(record.key, record);
  }

  deleteIdempotency(key: string): void {
    this.idempotency.delete(key);
  }

  addLatency(sample: LatencySample): void {
    this.latencies.push({ ...sample });
  }

  listLatencies(): LatencySample[] {
    return this.latencies.map((sample) => ({ ...sample }));
  }
}
