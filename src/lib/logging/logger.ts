/**
 * Structured JSON logger. One line per event, secrets redacted, safe to ship
 * to any log drain. Kept dependency-free so the web app and worker share it.
 */
import { redact } from "@/lib/security/redact";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level | undefined) ?? (process.env.NODE_ENV === "test" ? "warn" : "info");
  return ORDER[lvl] ?? ORDER.info;
}

function serialize(fields: Record<string, unknown>): string {
  return JSON.stringify(fields, (_k, v) => {
    if (typeof v === "bigint") return v.toString();
    if (v instanceof Error) return { name: v.name, message: redact(v.message) };
    return v;
  });
}

function emit(level: Level, component: string, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < threshold()) return;
  const line = redact(serialize({ ts: new Date().toISOString(), level, component, msg, ...(fields ?? {}) }));
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(component: string): Logger;
}

export function logger(component: string): Logger {
  return {
    debug: (m, f) => emit("debug", component, m, f),
    info: (m, f) => emit("info", component, m, f),
    warn: (m, f) => emit("warn", component, m, f),
    error: (m, f) => emit("error", component, m, f),
    child: (sub) => logger(`${component}.${sub}`),
  };
}
