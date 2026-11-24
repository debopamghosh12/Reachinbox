// Tiny timestamped logger. Deliberately dependency-free; could be swapped for pino later.
type Level = "info" | "warn" | "error";

function log(level: Level, message: string, meta?: unknown) {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  if (meta === undefined) console[level](line);
  else console[level](line, meta);
}

export const logger = {
  info: (message: string, meta?: unknown) => log("info", message, meta),
  warn: (message: string, meta?: unknown) => log("warn", message, meta),
  error: (message: string, meta?: unknown) => log("error", message, meta),
};
