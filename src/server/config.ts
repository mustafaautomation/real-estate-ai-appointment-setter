export function brokerageTimeZone(): string {
  return process.env.BROKERAGE_TIMEZONE || 'America/Chicago';
}

export function storageDriver(): 'memory' | 'sqlite' {
  return process.env.STORAGE_DRIVER === 'sqlite' ? 'sqlite' : 'memory';
}

export function calendarProvider(): 'memory' | 'calcom' | 'google' {
  const value = process.env.CALENDAR_PROVIDER;
  if (value === 'calcom' || value === 'google') return value;
  return 'memory';
}

export function databasePath(): string {
  return process.env.DATABASE_PATH || './data/harborline.db';
}
