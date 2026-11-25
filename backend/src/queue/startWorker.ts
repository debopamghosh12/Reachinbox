// The BullMQ worker itself. Started by the standalone worker process
// (queue/worker.ts) or inside the API when RUN_WORKER_IN_API=true (server.ts),
// so both run exactly the same code.
import { Worker } from "bullmq";
import { env } from "../config/env";
import { createRedisConnection } from "../config/redis";
import { EMAIL_QUEUE_NAME, type SendEmailJobData } from "./emailQueue";
import { processSendEmail } from "../services/sendEmail.service";
import { closeTransporters } from "../services/mailer";
import { logger } from "../utils/logger";

export interface RunningWorker {
  // Stops fetching new jobs and waits for the active ones (at most
  // SHUTDOWN_TIMEOUT_MS), then closes the worker's own connections.
  // Shared clients (prisma, redis, queue) are left to the caller.
  close(): Promise<void>;
}

export function startWorker(): RunningWorker {
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

  // worker.close() stops fetching new jobs and waits for the active ones to
  // finish, so a normal restart never leaves a row in 'sending'.
  // Rate-limited jobs are already back to 'scheduled' + delayed, so they're unaffected.
  // If an SMTP call hangs past SHUTDOWN_TIMEOUT_MS we stop waiting; that row stays
  // 'sending' and is handled by reconcile's stuck-row rule on the next boot.
  async function close() {
    logger.info(`Waiting for in-flight jobs (max ${env.SHUTDOWN_TIMEOUT_MS}ms)...`);
    const timedOut = await Promise.race([
      worker.close().then(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(true), env.SHUTDOWN_TIMEOUT_MS).unref()),
    ]);
    if (timedOut) logger.warn("Shutdown timeout reached with jobs still running - exiting anyway");
    else logger.info("All in-flight jobs finished");

    closeTransporters();
    await connection.quit().catch(() => undefined);
  }

  return { close };
}
