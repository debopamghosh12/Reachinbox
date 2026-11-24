import { redis } from "../config/redis";
import type { HourWindow } from "../queue/rateLimiter";
import { logger } from "../utils/logger";

// Called every time a job is pushed back by the hourly limit - which can be
// hundreds of times per hour - so we dedupe: SET NX succeeds only for the first
// caller per sender per window, across all workers.
// userId is passed now so Phase 3 can look up that user's Slack connection.
export async function onRateLimitHit(senderId: string, window: HourWindow, userId: string): Promise<void> {
  try {
    const ttlMs = window.end - Date.now() + 60_000;
    const first = await redis.set(`rl-notified:${senderId}:${window.key}`, "1", "PX", ttlMs, "NX");
    if (first !== "OK") return;

    // TODO(Phase 3): look up the user's Slack connection NOW and post to Slack.
    logger.warn(`[rate-limit] sender ${senderId} reached its hourly limit for window ${window.key} (user ${userId})`);
  } catch (err) {
    // A notification problem must never affect sending.
    logger.error("onRateLimitHit failed", err);
  }
}
