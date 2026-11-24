// API entry point (npm run dev). Only process lifecycle lives here.
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";
import { es } from "./config/elasticsearch";
import { ensureIndex } from "./services/search.service";
import { emailQueue } from "./queue/emailQueue";
import { reconcile } from "./queue/reconcile";
import { logger } from "./utils/logger";

async function main() {
  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (bull-board: /admin/queues)`);
  });

  // Bring Redis back in line with Postgres. Not awaited: the API can serve
  // requests meanwhile, because a new schedule and reconcile can't conflict
  // (both add jobs by jobId = email.id).
  reconcile().catch((err) => logger.error("[reconcile] failed", err));

  // Create the search index if missing. If ES is down this only logs a
  // warning; writes retry the creation later (see ensureIndex).
  void ensureIndex().then((ok) => ok && logger.info("[search] index ready"));

  // Graceful shutdown: stop accepting connections, let in-flight requests
  // finish, then close Redis/Postgres so nothing is cut off mid-write.
  async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down API...`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit(), es.close()]);
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start API", err);
  process.exit(1);
});
