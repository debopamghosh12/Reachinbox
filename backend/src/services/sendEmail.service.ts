import nodemailer from "nodemailer";
import { DelayedError, type Job } from "bullmq";
import type { Batch, Email, Sender } from "@prisma/client";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import type { SendEmailJobData } from "../queue/emailQueue";
import { nextRunAt, tryConsumeSlot } from "../queue/rateLimiter";
import { buildMessageId, discardTransporter, getTransporter } from "./mailer";
import { onRateLimitHit } from "./notifications.service";
import { syncToSearch } from "./search.service";
import { logger } from "../utils/logger";
import { htmlToText, isHtml } from "../utils/html";

type EmailWithRelations = Email & { batch: Batch; sender: Sender };

// Mirror a status change into the search index (background, never throws).
function sync(row: Email, batch: Batch) {
  syncToSearch([{ email: row, batch }]);
}

// The BullMQ processor: runs when a job's delay has elapsed.
// `token` identifies this worker's lock on the job; moveToDelayed needs it.
export async function processSendEmail(job: Job<SendEmailJobData>, token?: string) {
  const { emailId } = job.data;

  // 1) CLAIM. A single atomic statement:
  //      UPDATE emails SET status='sending', attempts=attempts+1
  //      WHERE id=$1 AND status='scheduled'
  //    Postgres row locking guarantees only one worker can flip it. If 0 rows
  //    changed, the email is already sending/sent/failed (duplicate job,
  //    re-enqueue, second worker...) -> skip. This is the idempotency gate.
  const claim = await prisma.email.updateMany({
    where: { id: emailId, status: "scheduled" },
    data: { status: "sending", attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    logger.warn(`[job ${job.id}] email ${emailId} not in 'scheduled' state - skipping`);
    return { skipped: true };
  }

  const email = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
    include: { batch: true, sender: true },
  });
  sync(email, email.batch); // status: sending

  // 2) HOURLY LIMIT. The request's hourlyLimit can only lower the global cap.
  const limit = Math.min(env.MAX_EMAILS_PER_HOUR_PER_SENDER, email.batch.hourlyLimit);
  const slot = await tryConsumeSlot(email.senderId, limit);
  if (!slot.allowed) {
    await postpone(job, token, email, slot, limit); // always throws DelayedError
  }

  // 3) SEND + RECORD
  return send(job, email);
}

// Pushes the job to a later hour window WITHOUT failing it or using up a retry.
async function postpone(
  job: Job<SendEmailJobData>,
  token: string | undefined,
  email: EmailWithRelations,
  slot: Awaited<ReturnType<typeof tryConsumeSlot>>,
  limit: number,
): Promise<never> {
  const runAt = nextRunAt(slot, limit, email.seq, env.RESCHEDULE_SEQ_OFFSET_MS);

  // DB first, then Redis. If we crash in between, the row is 'scheduled' and
  // the job is still active -> BullMQ's stalled check re-runs it later: safe.
  // The other order could leave the row stuck in 'sending' with a delayed job
  // that would then skip it forever.
  // attempts is decremented because this claim was not a send attempt.
  const updated = await prisma.email.update({
    where: { id: email.id },
    data: { status: "scheduled", scheduledAt: new Date(runAt), attempts: { decrement: 1 } },
  });
  await job.moveToDelayed(runAt, token);
  sync(updated, email.batch); // status: scheduled, new scheduledAt

  logger.info(
    `[job ${job.id}] sender ${email.sender.email} at ${slot.count}/${limit} for ${slot.window.key} -> moved to ${new Date(runAt).toISOString()}`,
  );
  // Not awaited: a slow Slack must never hold up the queue.
  void onRateLimitHit({ senderId: email.senderId, senderEmail: email.sender.email, userId: email.userId, limit, window: slot.window });

  // Tells BullMQ "I moved this job myself" - it is not counted as a failure.
  throw new DelayedError();
}

async function send(job: Job<SendEmailJobData>, email: EmailWithRelations) {
  const messageId = buildMessageId(email.id, email.sender.email);

  // Only the SMTP call is inside try/catch, on purpose: if the DB update
  // below failed we must NOT reset the row to 'scheduled', because the email
  // really was sent and a retry would send it twice.
  let previewUrl: string | null = null;
  try {
    // SMTP_DRY_RUN (load tests): skip the network call and treat it as accepted.
    if (!env.SMTP_DRY_RUN) {
      const info = await getTransporter(email.sender).sendMail({
        from: `"${email.sender.name}" <${email.sender.email}>`,
        to: email.toEmail,
        subject: email.batch.subject,
        // HTML bodies go out as multipart/alternative: the html part plus a
        // plain-text fallback for clients that don't show HTML. Old
        // plain-text bodies go out as text only, exactly as before.
        text: htmlToText(email.batch.body),
        ...(isHtml(email.batch.body) && { html: email.batch.body }),
        messageId,
      });
      // Ethereal gives a web URL where the captured message can be viewed.
      previewUrl = nodemailer.getTestMessageUrl(info) || null;
    }
  } catch (err) {
    // A cached transporter may hold a broken connection or old credentials.
    discardTransporter(email.senderId);
    const message = err instanceof Error ? err.message : String(err);
    // attemptsMade = attempts that already failed before this one.
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    // Not final: put the row back to 'scheduled' so the retry can claim it again.
    // (The hourly slot stays used: we can't be sure the server didn't count it.)
    const updated = await prisma.email.update({
      where: { id: email.id },
      data: { status: isFinalAttempt ? "failed" : "scheduled", error: message },
    });
    sync(updated, email.batch);
    logger.warn(`[job ${job.id}] send failed (attempt ${job.attemptsMade + 1}, final=${isFinalAttempt}): ${message}`);
    throw err; // let BullMQ apply attempts + exponential backoff
  }

  const sentRow = await prisma.email.update({
    where: { id: email.id },
    data: { status: "sent", sentAt: new Date(), previewUrl, messageId, error: null },
  });
  sync(sentRow, email.batch);

  logger.info(
    `[job ${job.id}] sent to ${email.toEmail} via ${email.sender.email}${env.SMTP_DRY_RUN ? " (dry run)" : ` -> ${previewUrl}`}`,
  );
  return { previewUrl };
}
