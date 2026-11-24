import { Queue } from "bullmq";
import { env } from "../config/env";
import { createRedisConnection } from "../config/redis";

export const EMAIL_QUEUE_NAME = "email-send";
const SEND_EMAIL_JOB = "send-email";

// The job carries ONLY the email id. Postgres is the source of truth for
// content, recipient and status; the job is just "wake up at time T for row X".
// This keeps Redis small and means a job can never hold stale data.
export interface SendEmailJobData {
  emailId: string;
}

export const queueConnection = createRedisConnection();

export const emailQueue = new Queue<SendEmailJobData>(EMAIL_QUEUE_NAME, {
  connection: queueConnection,
  defaultJobOptions: {
    // Transient SMTP failures retry with waits of backoff, 2x, 4x, ...
    attempts: env.JOB_ATTEMPTS,
    backoff: { type: "exponential", delay: env.JOB_BACKOFF_MS },
    // Keep finished jobs for a while (visible in bull-board, and because their
    // jobId stays "taken", re-adding the same email id is a no-op), then let them expire.
    removeOnComplete: { age: env.JOB_RETENTION_HOURS * 3600 },
    removeOnFail: { age: env.JOB_RETENTION_HOURS * 3600 },
  },
});

// Used by both scheduling and reconcile, so a job is always built the same way.
// jobId = email id: BullMQ ignores an add whose jobId already exists, which is
// what makes "add it again just in case" safe.
export function buildSendJob(email: { id: string; scheduledAt: Date }, now = Date.now()) {
  return {
    name: SEND_EMAIL_JOB,
    data: { emailId: email.id },
    opts: { jobId: email.id, delay: Math.max(0, email.scheduledAt.getTime() - now) },
  };
}
