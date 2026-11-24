import { randomUUID } from "node:crypto";
import { prisma } from "../config/prisma";
import { buildSendJob, emailQueue } from "../queue/emailQueue";
import type { ScheduleInput } from "../schemas/email.schemas";
import { AppError } from "../utils/AppError";

export async function scheduleEmails(userId: string, input: ScheduleInput, leads: string[]) {
  // Stable order so round-robin assignment is deterministic.
  const senders = await prisma.sender.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (senders.length === 0) {
    throw new AppError(503, "No senders configured - run `npm run db:seed`", "NoSenders");
  }

  // A start time in the past means "start now".
  const base = Math.max(input.startTime.getTime(), Date.now());
  const batchId = randomUUID();

  // We generate the ids ourselves (instead of letting Postgres do it) so we
  // know every email id up front: it becomes the BullMQ jobId, and createMany
  // doesn't return the inserted rows.
  const rows = leads.map((toEmail, i) => ({
    id: randomUUID(),
    batchId,
    userId,
    senderId: senders[i % senders.length].id, // round-robin
    toEmail,
    seq: i,
    scheduledAt: new Date(base + i * input.delayBetweenMs),
  }));

  // ONE transaction, two statements: the batch row + a single multi-row
  // INSERT for all emails. Either everything is stored or nothing is.
  await prisma.$transaction([
    prisma.batch.create({
      data: {
        id: batchId,
        userId,
        subject: input.subject,
        body: input.body,
        startTime: input.startTime,
        delayBetweenMs: input.delayBetweenMs,
        hourlyLimit: input.hourlyLimit,
      },
    }),
    prisma.email.createMany({ data: rows }),
  ]);

  // Only AFTER the commit do we enqueue: a job must never point at a row that
  // doesn't exist. addBulk sends all jobs to Redis in one round trip.
  // If Redis fails right here, the rows stay 'scheduled' without a job and
  // reconcile() re-adds them on the next boot.
  const now = Date.now();
  await emailQueue.addBulk(rows.map((row) => buildSendJob(row, now)));

  return {
    batchId,
    count: rows.length,
    firstSendAt: rows[0].scheduledAt,
    lastSendAt: rows[rows.length - 1].scheduledAt,
  };
}
