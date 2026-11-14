export type LogFields = Record<string, unknown>;

const SENSITIVE_KEYS = new Set([
  'email',
  'phone',
  'ssn',
  'from',
  'to',
  'body',
  'text',
  'authorization',
  'message',
  'raw',
]);

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const PHONE = /(?:\+\d{10,15}|\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4})/g;

export function redact(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key.toLowerCase())) return '[redacted]';
  if (typeof value === 'string') {
    return value.replace(EMAIL, '[email]').replace(SSN, '[ssn]').replace(PHONE, '[phone]');
  }
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      output[childKey] = redact(child, childKey);
    }
    return output;
  }
  return value;
}

export type Logger = {
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

export function createLogger(write: (line: string) => void = (line) => console.log(line)): Logger {
  const emit = (level: string, message: string, fields: LogFields = {}) => {
    const safe = redact(fields) as LogFields;
    const requestId = typeof safe.requestId === 'string' ? safe.requestId : undefined;
    write(
      JSON.stringify({
        level,
        msg: message,
        time: new Date().toISOString(),
        requestId,
        ...safe,
      }),
    );
  };
  return {
    info: (message, fields) => emit('info', message, fields),
    warn: (message, fields) => emit('warn', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
