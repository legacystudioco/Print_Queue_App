/** Structured JSON logging to stdout — easy to pipe into any log aggregator. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function write(level: LogLevel, message: string, bindings: Record<string, unknown>, fields?: Record<string, unknown>) {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...bindings,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

export function createLogger(minLevel: LogLevel, bindings: Record<string, unknown> = {}): Logger {
  const shouldLog = (level: LogLevel) => LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];

  return {
    debug: (message, fields) => shouldLog('debug') && write('debug', message, bindings, fields),
    info: (message, fields) => shouldLog('info') && write('info', message, bindings, fields),
    warn: (message, fields) => shouldLog('warn') && write('warn', message, bindings, fields),
    error: (message, fields) => shouldLog('error') && write('error', message, bindings, fields),
    child: (childBindings) => createLogger(minLevel, { ...bindings, ...childBindings }),
  };
}
