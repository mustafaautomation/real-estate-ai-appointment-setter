import { CalendarNotConfiguredError } from '@/domain/errors';
import type { Appointment, CalendarPort, TimeSlot } from '@/domain/types';
import { z } from 'zod';

const slotsSchema = z.object({
  data: z
    .object({
      slots: z.record(z.array(z.object({ start: z.string() }))).optional(),
    })
    .optional(),
});

/**
 * Optional Cal.com adapter. Off unless CALENDAR_PROVIDER=calcom and the API key is set.
 * Slot ids are the remote start instants. Booking posts to the public v2 bookings API.
 */
export class CalComCalendar implements CalendarPort {
  private readonly appointments = new Map<string, Appointment>();

  constructor(
    private readonly options: {
      apiKey: string;
      eventTypeId: string;
      baseUrl: string;
      timeZone: string;
      fetchImpl?: typeof fetch;
    },
  ) {
    if (!options.apiKey || !options.eventTypeId) throw new CalendarNotConfiguredError('calcom');
  }

  async listOpen(now: Date): Promise<TimeSlot[]> {
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const url = endpoint(this.options.baseUrl, 'slots');
    url.searchParams.set('start', now.toISOString());
    url.searchParams.set('end', end.toISOString());
    url.searchParams.set('eventTypeId', this.options.eventTypeId);
    url.searchParams.set('timeZone', this.options.timeZone);
    const response = await this.fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error(`Cal.com slots failed with ${response.status}`);
    const parsed = slotsSchema.parse(await response.json());
    const slots: TimeSlot[] = [];
    for (const day of Object.values(parsed.data?.slots ?? {})) {
      for (const slot of day) {
        const start = new Date(slot.start);
        if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) continue;
        const iso = start.toISOString();
        slots.push({
          id: `cal_${iso}`,
          start: iso,
          end: new Date(start.getTime() + 30 * 60_000).toISOString(),
          timezone: this.options.timeZone,
        });
      }
    }
    return slots.sort((a, b) => a.start.localeCompare(b.start));
  }

  async book(slotId: string, leadId: string, conversationId: string): Promise<Appointment> {
    const start = slotId.startsWith('cal_') ? slotId.slice(4) : slotId;
    const response = await this.fetch(endpoint(this.options.baseUrl, 'bookings'), {
      method: 'POST',
      body: JSON.stringify({
        start,
        eventTypeId: Number(this.options.eventTypeId),
        attendee: {
          name: `Lead ${leadId.slice(0, 8)}`,
          email: `lead-${leadId.slice(0, 8)}@example.com`,
          timeZone: this.options.timeZone,
          language: 'en',
        },
      }),
    });
    if (!response.ok) throw new Error(`Cal.com booking failed with ${response.status}`);
    const appointment: Appointment = {
      id: crypto.randomUUID(),
      slotId,
      leadId,
      conversationId,
      start,
      end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
      timezone: this.options.timeZone,
      status: 'booked',
    };
    this.appointments.set(appointment.id, appointment);
    return appointment;
  }

  release(appointmentId: string): void {
    const appointment = this.appointments.get(appointmentId);
    if (appointment) appointment.status = 'cancelled';
  }

  getAppointment(id: string): Appointment | null {
    const appointment = this.appointments.get(id);
    return appointment ? { ...appointment } : null;
  }

  listAppointments(): Appointment[] {
    return [...this.appointments.values()].map((appointment) => ({ ...appointment }));
  }

  private fetch(url: URL, init: { method: string; body?: string }): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    return fetchImpl(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        'cal-api-version': '2024-09-04',
      },
      body: init.body,
    });
  }
}

function endpoint(base: string, path: string): URL {
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return new URL(path.replace(/^\//, ''), normalized);
}
