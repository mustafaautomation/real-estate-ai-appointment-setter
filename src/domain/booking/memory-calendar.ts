import { SlotTakenError } from '../errors';
import type { Appointment, CalendarPort, TimeSlot } from '../types';
import { KeyedLock } from './lock';
import { generateSlots } from './slots';

type InternalSlot = TimeSlot & { state: 'open' | 'booked'; leadId?: string };

export class MemoryCalendar implements CalendarPort {
  private readonly slots = new Map<string, InternalSlot>();
  private readonly appointments = new Map<string, Appointment>();
  private readonly lock = new KeyedLock();

  constructor(
    now: Date,
    timeZone: string,
    private readonly idFactory: () => string = () => crypto.randomUUID(),
  ) {
    for (const slot of generateSlots(now, timeZone, 10)) {
      this.slots.set(slot.id, { ...slot, state: 'open' });
    }
  }

  async listOpen(now: Date): Promise<TimeSlot[]> {
    return [...this.slots.values()]
      .filter((slot) => slot.state === 'open' && new Date(slot.start).getTime() > now.getTime())
      .map((slot) => ({ id: slot.id, start: slot.start, end: slot.end, timezone: slot.timezone }))
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  async book(slotId: string, leadId: string, conversationId: string): Promise<Appointment> {
    return this.lock.run(slotId, async () => {
      const slot = this.slots.get(slotId);
      if (!slot || slot.state !== 'open') throw new SlotTakenError(slotId);
      await Promise.resolve();
      if (slot.state !== 'open') throw new SlotTakenError(slotId);
      slot.state = 'booked';
      slot.leadId = leadId;
      const appointment: Appointment = {
        id: this.idFactory(),
        slotId,
        leadId,
        conversationId,
        start: slot.start,
        end: slot.end,
        timezone: slot.timezone,
        status: 'booked',
      };
      this.appointments.set(appointment.id, appointment);
      return appointment;
    });
  }

  release(appointmentId: string): void {
    const appointment = this.appointments.get(appointmentId);
    if (!appointment || appointment.status === 'cancelled') return;
    appointment.status = 'cancelled';
    const slot = this.slots.get(appointment.slotId);
    if (slot && slot.leadId === appointment.leadId) {
      slot.state = 'open';
      delete slot.leadId;
    }
  }

  getAppointment(id: string): Appointment | null {
    const appointment = this.appointments.get(id);
    return appointment ? { ...appointment } : null;
  }

  listAppointments(): Appointment[] {
    return [...this.appointments.values()].map((appointment) => ({ ...appointment }));
  }

  markBooked(appointment: Appointment): void {
    const slot = this.slots.get(appointment.slotId);
    if (slot && appointment.status === 'booked') {
      slot.state = 'booked';
      slot.leadId = appointment.leadId;
    }
    this.appointments.set(appointment.id, { ...appointment });
  }
}
