import nodemailer, { type SentMessageInfo } from "nodemailer";
import type { Job } from "bullmq";
import { prisma } from "../config/prisma";
import type { SendEmailJobData } from "../queue/emailQueue";
import { buildMessageId, getTransporter } from "./mailer";
import { logger } from "../utils/logger";

// The BullMQ processor: runs when a job's delay has elapsed.
export async function processSendEmail(job: Job<SendEmailJobData>) {
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
  const messageId = buildMessageId(email.id, email.sender.email);

  // 2) SEND. Only the SMTP call is inside try/catch, on purpose: if the DB
  //    update in step 3 failed we must NOT reset the row to 'scheduled',
  //    because the email really was sent and a retry would send it twice.
  let info: SentMessageInfo;
  try {
    info = await getTransporter(email.sender).sendMail({
      from: `"${email.sender.name}" <${email.sender.email}>`,
      to: email.toEmail,
      subject: email.batch.subject,
      text: email.batch.body,
      messageId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // attemptsMade = attempts that already failed before this one.
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    // Not final: put the row back to 'scheduled' so the retry can claim it again.
    await prisma.email.update({
      where: { id: emailId },
      data: { status: isFinalAttempt ? "failed" : "scheduled", error: message },
    });
    logger.warn(`[job ${job.id}] send failed (attempt ${job.attemptsMade + 1}, final=${isFinalAttempt}): ${message}`);
    throw err; // let BullMQ apply attempts + exponential backoff
  }

  // 3) RECORD. Ethereal gives a web URL where the captured message can be viewed.
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;
  await prisma.email.update({
    where: { id: emailId },
    data: { status: "sent", sentAt: new Date(), previewUrl, messageId, error: null },
  });

  logger.info(`[job ${job.id}] sent to ${email.toEmail} via ${email.sender.email} -> ${previewUrl}`);
  return { previewUrl };
}
