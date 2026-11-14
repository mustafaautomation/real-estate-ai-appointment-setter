export const CHANNELS = ['web', 'sms', 'email', 'instagram', 'voice'] as const;
export type Channel = (typeof CHANNELS)[number];

export const PROPERTY_TYPES = ['condo', 'townhouse', 'single_family', 'multi_family'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const TIMELINES = ['asap', '30_days', '90_days', '6_months', 'browsing'] as const;
export type Timeline = (typeof TIMELINES)[number];

export const PIPELINE_STAGES = [
  'new',
  'qualifying',
  'qualified',
  'booked',
  'handoff',
  'opted_out',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const CONVERSATION_STAGES = [
  'greeting',
  'collecting',
  'matching',
  'scheduling',
  'booked',
  'handoff',
  'opted_out',
] as const;
export type ConversationStage = (typeof CONVERSATION_STAGES)[number];

export const SLOT_KEYS = ['budget', 'area', 'beds', 'propertyType', 'timeline'] as const;
export type SlotKey = (typeof SLOT_KEYS)[number];

export type Budget = {
  min?: number;
  max?: number;
  currency: 'USD';
};

export type Slots = {
  budget?: Budget;
  area?: string;
  beds?: number;
  propertyType?: PropertyType;
  timeline?: Timeline;
};

export type Listing = {
  id: string;
  address: string;
  neighborhood: string;
  city: string;
  beds: number;
  baths: number;
  type: PropertyType;
  price: number;
};

export type TimeSlot = {
  id: string;
  start: string;
  end: string;
  timezone: string;
};

export type Appointment = {
  id: string;
  slotId: string;
  leadId: string;
  conversationId: string;
  start: string;
  end: string;
  timezone: string;
  status: 'booked' | 'cancelled';
};

export type Language = 'en' | 'es' | 'other';

export type ReplyMode = 'offline' | 'openai' | 'offline_fallback';

export type GuardrailKind = 'fair_housing' | 'legal' | 'financial';

export type Session = {
  id: string;
  leadId: string;
  channel: Channel;
  stage: ConversationStage;
  slots: Slots;
  language: Language;
  optedOut: boolean;
  handoff: boolean;
  appointmentId?: string;
  listingIds: string[];
  turnCount: number;
  lastGuardrail?: GuardrailKind;
};

export type Lead = {
  id: string;
  channel: Channel;
  externalUserId: string;
  score: number;
  stage: PipelineStage;
  slots: Slots;
  appointmentId?: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  leadId: string;
  channel: Channel;
  externalUserId: string;
  session: Session;
  createdAt: string;
  updatedAt: string;
};

export type StoredMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  text: string;
  channel: Channel;
  createdAt: string;
  mode?: ReplyMode;
  latencyMs?: number;
};

export type IdempotencyRecord = {
  key: string;
  status: number;
  contentType: string;
  body: string;
  createdAt: string;
};

export type LatencySample = {
  id: string;
  channel: Channel;
  conversationId: string;
  latencyMs: number;
  createdAt: string;
};

export type SchedulePreference =
  | { kind: 'none' }
  | { kind: 'earliest' }
  | { kind: 'morning' }
  | { kind: 'afternoon' }
  | { kind: 'out_of_hours'; reason: string }
  | { kind: 'specific'; hour: number; minute: number };

export interface CalendarPort {
  listOpen(now: Date): Promise<TimeSlot[]>;
  book(slotId: string, leadId: string, conversationId: string): Promise<Appointment>;
  release(appointmentId: string): void;
  getAppointment(id: string): Appointment | null;
  listAppointments(): Appointment[];
}

export interface LeadRepository {
  upsertLead(lead: Lead): void;
  getLead(id: string): Lead | null;
  listLeads(): Lead[];
  upsertConversation(conversation: Conversation): void;
  getConversation(id: string): Conversation | null;
  findConversation(channel: Channel, externalUserId: string): Conversation | null;
  addMessage(message: StoredMessage): void;
  listMessages(conversationId: string): StoredMessage[];
  upsertAppointment(appointment: Appointment): void;
  listAppointments(): Appointment[];
  getIdempotency(key: string): IdempotencyRecord | null;
  /** Synchronous claim. Returns the existing row, or null when this caller owns a new pending row. */
  claimIdempotency(record: IdempotencyRecord): IdempotencyRecord | null;
  saveIdempotency(record: IdempotencyRecord): void;
  deleteIdempotency(key: string): void;
  addLatency(sample: LatencySample): void;
  listLatencies(): LatencySample[];
}
