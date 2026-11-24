// Makes Redis agree with Postgres after a restart, a Redis wipe, or a crash
// between the DB commit and addBulk. Postgres is the source of truth.
//
// Safe to run any number of times, from any number of processes at once
// (the API and each worker run it on boot): re-adding uses jobId = email.id,
// and BullMQ ignores an add whose jobId already exists.
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { buildSendJob, emailQueue } from "./emailQueue";
import { logger } from "../utils/logger";

export async function reconcile() {
  const stuckMarkedFailed = await failStuckSendingRows();
  const { checked, requeued } = await requeueMissingJobs();
  logger.info(
    `[reconcile] checked ${checked} scheduled rows, re-queued ${requeued} missing jobs, marked ${stuckMarkedFailed} stuck 'sending' rows as failed`,
  );
  return { checked, requeued, stuckMarkedFailed };
}

// A row stays in 'sending' only for the few seconds of an SMTP call. If it's
// been there longer than STUCK_SENDING_THRESHOLD_MS, the worker died mid-send
// and we CANNOT know whether the SMTP server accepted the message.
//
// Choice: mark it 'failed' (at-most-once) instead of re-queuing it (at-least-once).
//   + never sends a duplicate, which the spec treats as the worse outcome
//   - an email the crash interrupted BEFORE it reached SMTP is not sent; it
//     shows as failed with a clear reason, so the user can resend it.
// The threshold must stay well above the worst-case SMTP time, so a send
// that is merely slow on another live worker is never touched.
async function failStuckSendingRows(): Promise<number> {
  const cutoff = new Date(Date.now() - env.STUCK_SENDING_THRESHOLD_MS);
  const result = await prisma.email.updateMany({
    // updatedAt is set by the claim (status -> 'sending'), so it's "time in sending".
    where: { status: "sending", updatedAt: { lt: cutoff } },
    data: {
      status: "failed",
      error: "Interrupted while sending (worker crash). Not retried automatically to avoid a duplicate - check and resend if needed.",
    },
  });
  return result.count;
}

async function requeueMissingJobs(): Promise<{ checked: number; requeued: number }> {
  let checked = 0;
  let requeued = 0;
  let cursor: string | undefined;

  // Page through by id so memory stays flat no matter how many rows exist.
  for (;;) {
    const rows = await prisma.email.findMany({
      where: { status: "scheduled" },
      select: { id: true, scheduledAt: true },
      orderBy: { id: "asc" },
      take: env.RECONCILE_BATCH_SIZE,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;

    // Promise.all lets ioredis send all the lookups without waiting for each reply.
    const jobs = await Promise.all(rows.map((row) => emailQueue.getJob(row.id)));
    const missing = rows.filter((_, i) => !jobs[i]);

    if (missing.length > 0) {
      const now = Date.now();
      // Remaining delay from the row's scheduledAt; anything overdue runs now.
      await emailQueue.addBulk(missing.map((row) => buildSendJob(row, now)));
    }

    checked += rows.length;
    requeued += missing.length;
    cursor = rows[rows.length - 1].id;
  }

  return { checked, requeued };
}
