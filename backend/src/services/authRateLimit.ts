// Brute-force protection for login and signup: a fixed-window counter in
// Redis per IP and per email, separately for each action. Shared by every
// API process, and atomic (Lua), like the sending rate limiter.
import { createHash } from "node:crypto";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { AppError } from "../utils/AppError";

export type AuthAction = "login" | "signup";

// INCR, start the window's expiry on the first hit, return [count, ms left].
const HIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('PTTL', KEYS[1])}
`;

// The email is hashed so Redis never stores addresses in plain text.
function emailKey(action: AuthAction, email: string): string {
  return `auth:${action}:email:${createHash("sha256").update(email).digest("hex")}`;
}

async function hit(key: string, max: number): Promise<void> {
  const [count, msLeft] = (await redis.eval(HIT_LUA, 1, key, env.AUTH_RATE_WINDOW_MS)) as [number, number];
  if (count > max) {
    const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
    throw new AppError(429, `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`, "TooManyAttempts");
  }
}

// Counts one attempt and throws 429 if this IP or this email is over its limit.
// Called BEFORE checking the password, so a blocked attacker learns nothing.
export async function countAuthAttempt(action: AuthAction, ip: string, email: string): Promise<void> {
  await hit(`auth:${action}:ip:${ip}`, env.AUTH_MAX_ATTEMPTS_PER_IP);
  await hit(emailKey(action, email), env.AUTH_MAX_ATTEMPTS_PER_EMAIL);
}

// After a successful login, the account's own counter starts over, so a user
// who logs in and out a few times never locks themselves out.
export async function clearEmailAttempts(action: AuthAction, email: string): Promise<void> {
  await redis.del(emailKey(action, email));
}
