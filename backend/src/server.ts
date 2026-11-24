// API entry point (npm run dev). Only process lifecycle lives here.
import { createApp } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { emailQueue } from "./queue/emailQueue";
import { ensureDevUser } from "./middleware/devUser";
import { logger } from "./utils/logger";

async function main() {
  await ensureDevUser(); // TODO(Phase 4): remove with the dev user

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT} (bull-board: /admin/queues)`);
  });

  // Graceful shutdown: stop accepting connections, let in-flight requests
  // finish, then close Redis/Postgres so nothing is cut off mid-write.
  async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down API...`);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await emailQueue.close();
    await prisma.$disconnect();
    process.exit(0);
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start API", err);
  process.exit(1);
});
