export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export class SlotTakenError extends AppError {
  constructor(slotId: string) {
    super('slot_taken', `Slot ${slotId} is not open`, 409);
    this.name = 'SlotTakenError';
  }
}

export class CalendarNotConfiguredError extends AppError {
  constructor(provider: string) {
    super(
      'calendar_not_configured',
      `${provider} calendar is not configured. The desk stays on the in-memory calendar.`,
      501,
    );
    this.name = 'CalendarNotConfiguredError';
  }
}

export class LlmError extends AppError {
  constructor(message: string) {
    super('llm_failed', message, 502);
    this.name = 'LlmError';
  }
}
