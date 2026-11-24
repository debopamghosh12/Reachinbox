import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "./config/env";
import { emailQueue } from "./queue/emailQueue";
import { emailsRouter } from "./routes/emails.routes";
import { slackApiRouter, slackAuthRouter } from "./routes/slack.routes";
import { requestLogger } from "./middleware/requestLogger";
import { errorHandler, notFound } from "./middleware/errorHandler";
import { devUser } from "./middleware/devUser"; // TODO(Phase 4): replace with requireAuth

// Building the app separately from listen() keeps server.ts about process
// lifecycle only, and lets the app be imported in tests without opening a port.
export function createApp() {
  const app = express();

  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(requestLogger);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Live queue dashboard (TODO(Phase 4): protect behind auth).
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath("/admin/queues");
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use("/admin/queues", boardAdapter.getRouter());

  app.use("/auth/slack", slackAuthRouter); // browser redirects (OAuth)
  app.use("/api/emails", devUser, emailsRouter);
  app.use("/api/slack", devUser, slackApiRouter);

  // Order matters: these run only if no route above answered.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
