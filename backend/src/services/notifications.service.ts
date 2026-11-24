import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import type { HourWindow } from "../queue/rateLimiter";
import { postToWebhook } from "./slack.service";
import { logger } from "../utils/logger";

interface RateLimitHit {
  senderId: string;
  senderEmail: string;
  userId: string; // owner of the email that hit the limit
  limit: number;
  window: HourWindow;
}

// Called by the worker (not awaited) every time a job is pushed back by the
// hourly limit. Never throws: Slack problems must not affect sending.
export async function onRateLimitHit(hit: RateLimitHit): Promise<void> {
  try {
    // 1) Look up the connection NOW (not cached at boot), so connecting or
    //    disconnecting takes effect immediately - no restart needed.
    //    Done BEFORE the dedupe, so a user who connects mid-hour still gets
    //    notified at the next hit in that same hour.
    const connection = await prisma.slackConnection.findUnique({ where: { userId: hit.userId } });
    if (!connection) return; // not connected: skip silently

    // 2) Dedupe: this can fire hundreds of times per hour. SET NX succeeds only
    //    for the first caller per sender per window, across all workers.
    const ttlMs = hit.window.end - Date.now() + 60_000;
    const first = await redis.set(`rl-notified:${hit.senderId}:${hit.window.key}`, "1", "PX", ttlMs, "NX");
    if (first !== "OK") return;

    // 3) How many of this user's emails from this sender are affected: the one
    //    just moved, plus the ones still due before this window ends (they will
    //    be moved too, because the sender has no capacity left this hour).
    const stillDue = await prisma.email.count({
      where: { userId: hit.userId, senderId: hit.senderId, status: "scheduled", scheduledAt: { lt: new Date(hit.window.end) } },
    });

    await postToWebhook(connection.webhookUrl, { text: formatMessage(hit, 1 + stillDue) });
    logger.info(`[slack] rate-limit notification sent (sender ${hit.senderEmail}, window ${hit.window.key})`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[slack] rate-limit notification failed: ${message.slice(0, 120)}`);
  }
}

function formatMessage(hit: RateLimitHit, affected: number): string {
  const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);
  const day = new Date(hit.window.start).toISOString().slice(0, 10);
  return [
    ":warning: *Hourly sending limit reached*",
    `• Sender: \`${hit.senderEmail}\``,
    `• Limit: ${hit.limit} emails per hour`,
    `• Window: ${day} ${hhmm(hit.window.start)}–${hhmm(hit.window.end)} UTC`,
    `• ${affected} of your email(s) from this sender ${affected === 1 ? "was" : "were"} moved to a later hour. Nothing was dropped.`,
  ].join("\n");
}
