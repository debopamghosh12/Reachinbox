// API entry point (npm run dev / npm start). Only process lifecycle lives here.
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { redis, warnIfRedisCanEvict } from "./config/redis";
import { closeSearch, searchEnabled } from "./config/elasticsearch";
import { ensureIndex } from "./services/search.service";
import { seedSendersIfEmpty } from "./services/seedSenders";
import { emailQueue } from "./queue/emailQueue";
import { reconcile } from "./queue/reconcile";
import { startWorker, type RunningWorker } from "./queue/startWorker";
import { logger } from "./utils/logger";

async function main() {
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on port ${env.PORT} (bull-board: /admin/queues)`);
  });

  // One hosted service can run both roles. Locally the worker is usually its
  // own process (npm run dev:worker); this is the same code (startWorker.ts).
  let worker: RunningWorker | undefined;
  if (env.RUN_WORKER_IN_API) {
    logger.info("RUN_WORKER_IN_API=true: starting the email worker in this process");
    worker = startWorker();
  }

  void warnIfRedisCanEvict();

  // A fresh database (e.g. a new hosted Postgres) gets its Ethereal senders
  // here, so scheduling works without a manual `npm run db:seed`.
  void seedSendersIfEmpty(prisma, env.SEED_SENDER_COUNT);

  // Bring Redis back in line with Postgres. Not awaited: the API can serve
  // requests meanwhile, because a new schedule and reconcile can't conflict
  // (both add jobs by jobId = email.id).
  reconcile().catch((err) => logger.error("[reconcile] failed", err));

  // Create the search index if missing. If ES is down this only logs a
  // warning; writes retry the creation later (see ensureIndex).
  if (searchEnabled) void ensureIndex().then((ok) => ok && logger.info("[search] index ready"));
  else logger.info("[search] ELASTICSEARCH_URL not set: indexing disabled, search uses Postgres ILIKE");

  // Graceful shutdown: stop accepting connections, let in-flight requests
  // (and in-flight sends, if the worker runs here) finish, then close
  // Redis/Postgres so nothing is cut off mid-write.
  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down API...`);
    await Promise.all([
      new Promise<void>((resolve) => server.close(() => resolve())),
      worker?.close(),
    ]);
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit(), closeSearch()]);
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start API", err);
  process.exit(1);
});
