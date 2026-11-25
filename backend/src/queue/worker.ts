// Worker entry point - runs as its own process (npm run dev:worker).
// You can start several of these; correctness does not depend on there being one.
// For a single hosted service, RUN_WORKER_IN_API=true runs the same worker
// inside the API process instead (see server.ts).
import { prisma } from "../config/prisma";
import { redis, warnIfRedisCanEvict } from "../config/redis";
import { closeSearch, searchEnabled } from "../config/elasticsearch";
import { ensureIndex } from "../services/search.service";
import { emailQueue } from "./emailQueue";
import { reconcile } from "./reconcile";
import { startWorker } from "./startWorker";
import { logger } from "../utils/logger";

const worker = startWorker();

void warnIfRedisCanEvict();
if (!searchEnabled) logger.info("[search] ELASTICSEARCH_URL not set: indexing disabled");

// Also reconcile from the worker, so a worker-only restart recovers too.
// Running it here AND in the API at the same time is safe (see reconcile.ts).
reconcile().catch((err) => logger.error("[reconcile] failed", err));
void ensureIndex();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down worker...`);
  await worker.close();
  await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit(), closeSearch()]);
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
