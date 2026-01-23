type LogContext = Record<string, unknown>;

type ErrorPayload = {
  message: string;
  stack?: string;
  name?: string;
};

function normalizeError(error: unknown): ErrorPayload | undefined {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack, name: error.name };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return undefined;
}

function writeLog(level: "info" | "warn" | "error", message: string, context?: LogContext) {
  const payload: Record<string, unknown> = {
    level,
    msg: message,
    ts: new Date().toISOString(),
  };
  if (context) {
    Object.assign(payload, context);
  }
  if (level === "error" && ERROR_MONITOR_DSN) {
    reportError(payload);
  }
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function reportError(payload: Record<string, unknown>) {
  // Placeholder for error monitoring hooks.
  console.info(JSON.stringify({ level: "monitor", msg: "error_reported", ts: new Date().toISOString(), payload }));
}

export const ERROR_MONITOR_DSN = (Bun.env.ERROR_MONITOR_DSN ?? "").trim();

export function info(message: string, context?: LogContext) {
  writeLog("info", message, context);
}

export function warn(message: string, context?: LogContext) {
  writeLog("warn", message, context);
}

export function error(message: string, context?: LogContext) {
  writeLog("error", message, context);
}

export function logInfo(message: string, meta?: Record<string, unknown>) {
  info(message, meta);
}

export function logError(message: string, err?: unknown) {
  const normalized = normalizeError(err);
  error(message, normalized ? { error: normalized } : undefined);
}
