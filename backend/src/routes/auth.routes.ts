import { Router, type Response } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import {
  GOOGLE_STATE_COOKIE,
  SESSION_COOKIE,
  createSessionToken,
  googleStateCookieOptions,
  isValidGoogleState,
  loginWithGoogleCode,
  sessionCookieOptions,
  startGoogleLogin,
} from "../services/auth.service";
import { getUserId } from "../utils/requestUser";
import { logger } from "../utils/logger";

// Browser-facing login routes, mounted at /auth.
export const authRouter = Router();

function toLoginPage(res: Response, reason: string) {
  res.redirect(`${env.FRONTEND_URL}/login?${new URLSearchParams({ error: reason })}`);
}

// Step 1: send the browser to Google's consent screen.
authRouter.get("/google", (_req, res) => {
  const { url, nonce } = startGoogleLogin();
  res.cookie(GOOGLE_STATE_COOKIE, nonce, googleStateCookieOptions());
  res.redirect(url);
});

// Step 2: Google sends the browser back here with ?code&state (or ?error).
authRouter.get("/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  // The state check comes first, even for "cancelled": until it passes, we
  // can't trust that this request comes from a login we started.
  const stateOk = isValidGoogleState(state, req.cookies?.[GOOGLE_STATE_COOKIE]);
  res.clearCookie(GOOGLE_STATE_COOKIE, googleStateCookieOptions()); // single use
  if (!stateOk) return toLoginPage(res, "invalid_state");
  if (error) return toLoginPage(res, error === "access_denied" ? "cancelled" : "google_error");
  if (typeof code !== "string" || !code) return toLoginPage(res, "missing_code");

  let user;
  try {
    user = await loginWithGoogleCode(code);
  } catch (err) {
    logger.warn(`[auth] Google login failed: ${err instanceof Error ? err.message : String(err)}`);
    return toLoginPage(res, "exchange_failed");
  }

  res.cookie(SESSION_COOKIE, createSessionToken(user.id), { ...sessionCookieOptions(), maxAge: env.SESSION_TTL_MS });
  logger.info(`[auth] user ${user.id} logged in`);
  res.redirect(`${env.FRONTEND_URL}/dashboard`);
});

// The session is a stateless JWT, so logging out means deleting the cookie.
// (Trade-off: a copied token stays valid until it expires. See the README.)
authRouter.post("/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.status(204).end();
});

// JSON API, mounted at /api/me (behind requireAuth).
export const meRouter = Router();

meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: getUserId(req) },
    select: { name: true, email: true, avatarUrl: true },
  });
  res.json(user);
});
