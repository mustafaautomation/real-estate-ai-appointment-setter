import { CalComCalendar } from '@/adapters/calendar/calcom';
import { GoogleCalendar } from '@/adapters/calendar/google';
import { createLogger, type Logger } from '@/adapters/logging/logger';
import { createReplyModel, type ReplyModel } from '@/adapters/llm/model';
import { MemoryRepository } from '@/adapters/storage/memory';
import { SqlRepository } from '@/adapters/storage/sql-repository';
import { SqliteExecutor } from '@/adapters/storage/sqlite';
import { resetRateLimit } from '@/adapters/http/rate-limit';
import { MemoryCalendar } from '@/domain/booking/memory-calendar';
import type { CalendarPort, LeadRepository } from '@/domain/types';

import { brokerageTimeZone, calendarProvider, databasePath, storageDriver } from './config';
import { seedDemo } from './seed';

export type Container = {
  repo: LeadRepository;
  calendar: CalendarPort;
  model: ReplyModel;
  logger: Logger;
  timeZone: string;
  storage: 'memory' | 'sqlite';
  calendarName: 'memory' | 'calcom' | 'google';
  ready: Promise<void>;
};

type GlobalState = typeof globalThis & { __harborline?: Container };

export function getContainer(): Container {
  const state = globalThis as GlobalState;
  if (!state.__harborline) state.__harborline = createContainer();
  return state.__harborline;
}

export function resetContainer(): void {
  const state = globalThis as GlobalState;
  delete state.__harborline;
  resetRateLimit();
}

export function createContainer(): Container {
  const timeZone = brokerageTimeZone();
  const storage = storageDriver();
  const repo =
    storage === 'sqlite'
      ? new SqlRepository(new SqliteExecutor(databasePath()))
      : new MemoryRepository();
  const calendarName = calendarProvider();
  const calendar = createCalendar(calendarName, repo, timeZone);
  const container: Container = {
    repo,
    calendar,
    model: createReplyModel(),
    logger: createLogger(),
    timeZone,
    storage,
    calendarName,
    ready: Promise.resolve(),
  };
  if (
    process.env.NODE_ENV !== 'test' &&
    process.env.SEED_DEMO !== '0' &&
    calendarName === 'memory'
  ) {
    container.ready = seedDemo(container);
  }
  return container;
}

function createCalendar(
  provider: 'memory' | 'calcom' | 'google',
  repo: LeadRepository,
  timeZone: string,
): CalendarPort {
  if (provider === 'calcom') {
    return new CalComCalendar({
      apiKey: process.env.CALCOM_API_KEY ?? '',
      eventTypeId: process.env.CALCOM_EVENT_TYPE_ID ?? '',
      baseUrl: process.env.CALCOM_API_BASE || 'https://api.cal.com/v2',
      timeZone,
    });
  }
  if (provider === 'google') {
    return new GoogleCalendar({
      accessToken: process.env.GOOGLE_CALENDAR_ACCESS_TOKEN ?? '',
      calendarId: process.env.GOOGLE_CALENDAR_ID ?? '',
      timeZone,
    });
  }
  const calendar = new MemoryCalendar(new Date(), timeZone);
  for (const appointment of repo.listAppointments()) {
    if (appointment.status === 'booked') calendar.markBooked(appointment);
  }
  return calendar;
}
