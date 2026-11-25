import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { env } from "./config/env";
import { emailQueue } from "./queue/emailQueue";
import { authRouter, meRouter } from "./routes/auth.routes";
import { emailsRouter } from "./routes/emails.routes";
import { slackApiRouter, slackAuthRouter } from "./routes/slack.routes";
import { requestLogger } from "./middleware/requestLogger";
import { requireAdmin, requireAuth } from "./middleware/requireAuth";
import { errorHandler, notFound } from "./middleware/errorHandler";

// Building the app separately from listen() keeps server.ts about process
// lifecycle only, and lets the app be imported in tests without opening a port.
export function createApp() {
  const app = express();

  // Hosted, the API sits behind one reverse proxy (Railway's edge), which
  // terminates TLS. Trusting exactly one hop makes req.ip the address that
  // proxy saw (used by the login rate limit) and req.secure reflect https.
  // Locally there is no proxy and no X-Forwarded-For, so nothing changes.
  app.set("trust proxy", 1);

  // Only our frontend may call the API from a browser, with cookies
  // ("credentials"). Other origins get no CORS headers, so the browser won't
  // let their pages read our responses. (A list, not a plain string: with a
  // string the cors package sends the header to EVERY origin, and only the
  // browser's exact-match check would block them.)
  app.use(cors({ origin: [env.FRONTEND_URL], credentials: true }));
  app.use(express.json({ limit: env.JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(requestLogger);

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Live queue dashboard. It shows every user's jobs, so it is admins only.
  const boardAdapter = new ExpressAdapter();
  boardAdapter.setBasePath("/admin/queues");
  createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
  app.use("/admin/queues", requireAuth, requireAdmin, boardAdapter.getRouter());

  // Browser redirects (OAuth).
  app.use("/auth/slack", slackAuthRouter);
  app.use("/auth", authRouter);

  // Every /api/* route needs a logged-in user. It's one line here instead of
  // one per router, so a new route can't forget it.
  app.use("/api", requireAuth);
  app.use("/api/me", meRouter);
  app.use("/api/emails", emailsRouter);
  app.use("/api/slack", slackApiRouter);

  // Order matters: these run only if no route above answered.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
