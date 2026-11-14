import { generateSlots } from '@/domain/booking/slots';
import { CalendarNotConfiguredError } from '@/domain/errors';
import type { Appointment, CalendarPort, TimeSlot } from '@/domain/types';
import { z } from 'zod';

const freeBusySchema = z.object({
  calendars: z.record(
    z.object({
      busy: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
    }),
  ),
});

/**
 * Optional Google Calendar adapter. Off unless CALENDAR_PROVIDER=google
 * and GOOGLE_CALENDAR_ACCESS_TOKEN plus GOOGLE_CALENDAR_ID are set.
 * This process does not run an OAuth consent flow. See docs/adrs/003-repository-and-calendar.md.
 */
export class GoogleCalendar implements CalendarPort {
  private readonly appointments = new Map<string, Appointment>();

  constructor(
    private readonly options: {
      accessToken: string;
      calendarId: string;
      timeZone: string;
      fetchImpl?: typeof fetch;
    },
  ) {
    if (!options.accessToken || !options.calendarId) throw new CalendarNotConfiguredError('google');
  }

  async listOpen(now: Date): Promise<TimeSlot[]> {
    const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const response = await this.fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        timeZone: this.options.timeZone,
        items: [{ id: this.options.calendarId }],
      }),
    });
    if (!response.ok) throw new Error(`Google freeBusy failed with ${response.status}`);
    const parsed = freeBusySchema.parse(await response.json());
    const busy = parsed.calendars[this.options.calendarId]?.busy ?? [];
    return generateSlots(now, this.options.timeZone, 10).filter((slot) => !overlaps(slot, busy));
  }

  async book(slotId: string, leadId: string, conversationId: string): Promise<Appointment> {
    const start = slotId.startsWith('slot_') ? slotId.slice('slot_'.length) : slotId;
    const end = new Date(new Date(start).getTime() + 30 * 60_000).toISOString();
    const response = await this.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.options.calendarId)}/events`,
      {
        method: 'POST',
        body: JSON.stringify({
          summary: 'Harborline tour',
          start: { dateTime: start, timeZone: this.options.timeZone },
          end: { dateTime: end, timeZone: this.options.timeZone },
        }),
      },
    );
    if (!response.ok) throw new Error(`Google event insert failed with ${response.status}`);
    const payload = (await response.json()) as { id?: string };
    const appointment: Appointment = {
      id: payload.id ?? crypto.randomUUID(),
      slotId,
      leadId,
      conversationId,
      start,
      end,
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

  private fetch(url: string, init: { method: string; body: string }): Promise<Response> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    return fetchImpl(url, {
      method: init.method,
      headers: {
        authorization: `Bearer ${this.options.accessToken}`,
        'content-type': 'application/json',
      },
      body: init.body,
    });
  }
}

function overlaps(slot: TimeSlot, busy: readonly { start: string; end: string }[]): boolean {
  const start = new Date(slot.start).getTime();
  const end = new Date(slot.end).getTime();
  return busy.some(
    (block) => start < new Date(block.end).getTime() && end > new Date(block.start).getTime(),
  );
}
