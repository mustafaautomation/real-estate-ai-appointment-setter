import { generateSlots } from '@/domain/booking/slots';
import { SlotTakenError } from '@/domain/errors';
import type { Appointment, CalendarPort, TimeSlot } from '@/domain/types';

import { RelayClient } from './client';

type HeldAppointment = Appointment & { slot_key?: string };

export class ReserveCalendar implements CalendarPort {
  constructor(
    private readonly client: RelayClient,
    private readonly timeZone: string,
  ) {}

  async listOpen(now: Date): Promise<TimeSlot[]> {
    const held = await this.heldSlotKeys();
    return generateSlots(now, this.timeZone, 10).filter(
      (slot) => !held.has(slot.id) && new Date(slot.start).getTime() > now.getTime(),
    );
  }

  async book(slotId: string, leadId: string, conversationId: string): Promise<Appointment> {
    const slot = generateSlots(new Date(), this.timeZone, 10).find((item) => item.id === slotId);
    if (!slot) throw new SlotTakenError(slotId);
    const appointment: Appointment = {
      id: crypto.randomUUID(),
      slotId,
      leadId,
      conversationId,
      start: slot.start,
      end: slot.end,
      timezone: slot.timezone,
      status: 'booked',
    };
    await this.client.reserve(appointment.id, { ...appointment, slot_key: slotId });
    return appointment;
  }

  async release(appointmentId: string): Promise<void> {
    const existing = await this.client.get<HeldAppointment>('appointments', appointmentId);
    if (!existing || existing.status === 'cancelled') return;
    await this.client.put('appointments', appointmentId, {
      ...existing,
      status: 'cancelled',
      slot_key: existing.slot_key ?? existing.slotId,
    });
  }

  async getAppointment(id: string): Promise<Appointment | null> {
    const row = await this.client.get<HeldAppointment>('appointments', id);
    return row ? toAppointment(row) : null;
  }

  async listAppointments(): Promise<Appointment[]> {
    const rows = await this.client.list<HeldAppointment>('appointments', { limit: 100 });
    return rows.map((row) => toAppointment(row));
  }

  private async heldSlotKeys(): Promise<Set<string>> {
    const rows = await this.client.list<HeldAppointment>('appointments', { limit: 100 });
    const held = new Set<string>();
    for (const row of rows) {
      if (row.status === 'cancelled') continue;
      const key = row.slot_key ?? row.slotId;
      if (key) held.add(key);
    }
    return held;
  }
}

function toAppointment(row: HeldAppointment): Appointment {
  return {
    id: row.id,
    slotId: row.slotId,
    leadId: row.leadId,
    conversationId: row.conversationId,
    start: row.start,
    end: row.end,
    timezone: row.timezone,
    status: row.status === 'cancelled' ? 'cancelled' : 'booked',
  };
}
