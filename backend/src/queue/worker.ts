// Worker entry point - runs as its own process (npm run dev:worker).
// You can start several of these; correctness does not depend on there being one.
import { Worker } from "bullmq";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { createRedisConnection } from "../config/redis";
import { EMAIL_QUEUE_NAME, emailQueue, type SendEmailJobData } from "./emailQueue";
import { processSendEmail } from "../services/sendEmail.service";
import { closeTransporters } from "../services/mailer";
import { logger } from "../utils/logger";

const connection = createRedisConnection();

const worker = new Worker<SendEmailJobData>(EMAIL_QUEUE_NAME, processSendEmail, {
  connection,
  // How many jobs THIS process runs at the same time.
  concurrency: env.WORKER_CONCURRENCY,
  // At most 1 job starts per MIN_DELAY_MS. The limiter state lives in Redis,
  // so the gap is enforced across ALL worker processes, not per process.
  limiter: env.MIN_DELAY_MS > 0 ? { max: 1, duration: env.MIN_DELAY_MS } : undefined,
});

worker.on("ready", () =>
  logger.info(`Worker ready (concurrency=${env.WORKER_CONCURRENCY}, minDelay=${env.MIN_DELAY_MS}ms)`),
);
// "failed" fires after EVERY failed attempt; only the last one is a real failure
// (earlier ones are already logged as warnings by the processor and will retry).
worker.on("failed", (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    logger.error(`[job ${job.id}] permanently failed after ${job.attemptsMade} attempts: ${err.message}`);
  }
});
worker.on("error", (err) => logger.error("Worker error", err));

// Graceful shutdown: worker.close() stops taking new jobs and waits for the
// active ones to finish, so we don't leave a row half-way through sending.
async function shutdown(signal: string) {
  logger.info(`${signal} received, closing worker...`);
  await worker.close();
  closeTransporters();
  await emailQueue.close();
  await prisma.$disconnect();
  await connection.quit();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
