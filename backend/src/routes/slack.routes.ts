import { Router, type Response } from "express";
import { env } from "../config/env";
import { devUser } from "../middleware/devUser"; // TODO(Phase 4): replace with requireAuth
import {
  buildAuthorizeUrl,
  connectWithCode,
  disconnectSlack,
  getSlackStatus,
  isSlackConfigured,
  verifyState,
} from "../services/slack.service";
import { getUserId } from "../utils/requestUser";
import { logger } from "../utils/logger";

// Browser-facing OAuth routes, mounted at /auth/slack.
export const slackAuthRouter = Router();

// The browser always ends up back in the app, with a flag the UI can show.
function backToApp(res: Response, result: "connected" | "error", reason?: string) {
  const params = new URLSearchParams({ slack: result, ...(reason && { reason }) });
  res.redirect(`${env.FRONTEND_URL}/?${params}`);
}

// Step 1: send the user to Slack's "Allow" screen.
// TODO(Phase 4): devUser -> requireAuth (the logged-in user starts the flow).
slackAuthRouter.get("/", devUser, (req, res) => {
  if (!isSlackConfigured()) return backToApp(res, "error", "not_configured");
  res.redirect(buildAuthorizeUrl(getUserId(req)));
});

// Step 2: Slack sends the user back here. No auth middleware on purpose: this
// arrives on the tunnel domain without our cookie; the signed state says who it is.
slackAuthRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  const userId = verifyState(state);
  if (!userId) return backToApp(res, "error", "invalid_state"); // forged, expired or missing
  if (error) return backToApp(res, "error", error === "access_denied" ? "cancelled" : "slack_error");
  if (typeof code !== "string" || !code) return backToApp(res, "error", "missing_code");

  try {
    await connectWithCode(userId, code);
  } catch (err) {
    logger.warn(`[slack] OAuth callback failed: ${err instanceof Error ? err.message : String(err)}`);
    return backToApp(res, "error", "exchange_failed");
  }
  logger.info(`[slack] user ${userId} connected Slack`);
  backToApp(res, "connected");
});

// JSON API, mounted at /api/slack behind the (dev) auth middleware.
export const slackApiRouter = Router();

slackApiRouter.get("/status", async (req, res) => {
  res.json(await getSlackStatus(getUserId(req)));
});

slackApiRouter.delete("/", async (req, res) => {
  await disconnectSlack(getUserId(req));
  res.status(204).end();
});
