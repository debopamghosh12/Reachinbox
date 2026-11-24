// Worker entry point - runs as its own process (npm run dev:worker).
// You can start several of these; correctness does not depend on there being one.
import { Worker } from "bullmq";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { createRedisConnection, redis } from "../config/redis";
import { es } from "../config/elasticsearch";
import { ensureIndex } from "../services/search.service";
import { EMAIL_QUEUE_NAME, emailQueue, type SendEmailJobData } from "./emailQueue";
import { reconcile } from "./reconcile";
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
  logger.info(
    `Worker ${process.pid} ready (concurrency=${env.WORKER_CONCURRENCY}, minDelay=${env.MIN_DELAY_MS}ms, dryRun=${env.SMTP_DRY_RUN})`,
  ),
);
// "failed" fires after EVERY failed attempt; only the last one is a real failure
// (earlier ones are already logged as warnings by the processor and will retry).
worker.on("failed", (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    logger.error(`[job ${job.id}] permanently failed after ${job.attemptsMade} attempts: ${err.message}`);
  }
});
worker.on("error", (err) => logger.error("Worker error", err));

// Also reconcile from the worker, so a worker-only restart recovers too.
// Running it here AND in the API at the same time is safe (see reconcile.ts).
reconcile().catch((err) => logger.error("[reconcile] failed", err));
void ensureIndex();

// Graceful shutdown: worker.close() stops fetching new jobs and waits for the
// active ones to finish, so a normal restart never leaves a row in 'sending'.
// Rate-limited jobs are already back to 'scheduled' + delayed, so they're unaffected.
// If an SMTP call hangs past SHUTDOWN_TIMEOUT_MS we exit anyway; that row stays
// 'sending' and is handled by reconcile's stuck-row rule on the next boot.
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, waiting for in-flight jobs (max ${env.SHUTDOWN_TIMEOUT_MS}ms)...`);

  const timedOut = await Promise.race([
    worker.close().then(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), env.SHUTDOWN_TIMEOUT_MS)),
  ]);
  if (timedOut) logger.warn("Shutdown timeout reached with jobs still running - exiting anyway");
  else logger.info("All in-flight jobs finished");

  closeTransporters();
  await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), connection.quit(), redis.quit(), es.close()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
