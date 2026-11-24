// Per-sender hourly rate limit, shared by ALL worker processes via Redis.
import { redis } from "../config/redis";

// The definition of "hourly", not a tunable limit.
export const HOUR_MS = 60 * 60 * 1000;

export interface HourWindow {
  key: string; // YYYYMMDDHH in UTC, e.g. "2026112407"
  start: number; // epoch ms
  end: number; // epoch ms = start of the next window
}

// Fixed clock-hour windows in UTC (independent of server timezone).
export function hourWindow(now = Date.now()): HourWindow {
  const start = Math.floor(now / HOUR_MS) * HOUR_MS;
  const key = new Date(start).toISOString().slice(0, 13).replace(/[-T]/g, ""); // "2026-11-24T07" -> "2026112407"
  return { key, start, end: start + HOUR_MS };
}

// Runs atomically inside Redis: no other worker can run a command between
// these lines, so two workers can never both take the "last" slot.
//   KEYS[1] = rl:{senderId}:{window}  sends counted in this window
//   KEYS[2] = ov:{senderId}:{window}  how many jobs overflowed in this window
//   ARGV[1] = limit, ARGV[2] = TTL in seconds
// Returns { allowed (1/0), count after this call, overflow position (0 if allowed) }.
const CONSUME_SLOT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if count <= tonumber(ARGV[1]) then
  return {1, count, 0}
end
-- Over the limit: undo our increment so the counter stays == real sends.
redis.call('DECR', KEYS[1])
local overflow = redis.call('INCR', KEYS[2])
if overflow == 1 then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
return {0, count - 1, overflow}
`;

export interface SlotResult {
  allowed: boolean;
  count: number; // sends counted for this sender in this window
  overflowPosition: number; // 1st, 2nd, ... job rejected in this window
  window: HourWindow;
}

export async function tryConsumeSlot(senderId: string, limit: number, now = Date.now()): Promise<SlotResult> {
  const window = hourWindow(now);
  // Keep keys a little past the window's end, then Redis deletes them itself.
  const ttlSeconds = Math.ceil((window.end - now) / 1000) + 60;
  const [allowed, count, overflow] = (await redis.eval(
    CONSUME_SLOT_LUA,
    2,
    `rl:${senderId}:${window.key}`,
    `ov:${senderId}:${window.key}`,
    limit,
    ttlSeconds,
  )) as [number, number, number];
  return { allowed: allowed === 1, count, overflowPosition: overflow, window };
}

// Where a rate-limited job should run next.
// Naively, every overflowing job would go to the NEXT hour, so with 1000 jobs
// and a limit of 5, ~995 jobs would wake up every hour just to be pushed again
// (and each wake-up also eats a MIN_DELAY limiter slot). Instead the overflow
// position spreads them: the first `limit` overflows go to hour+1, the next
// `limit` to hour+2, and so on. This is only a placement hint - when the job
// wakes up it still goes through tryConsumeSlot, so correctness never depends on it.
export function nextRunAt(slot: SlotResult, limit: number, seq: number, seqOffsetMs: number): number {
  const windowsAhead = Math.floor((slot.overflowPosition - 1) / limit);
  return slot.window.end + windowsAhead * HOUR_MS + seq * seqOffsetMs;
}
