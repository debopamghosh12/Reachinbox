// Google login (OAuth 2.0 authorization-code flow) and our own session cookie.
// SECURITY: the client secret, Google's code/access token and the session
// token are credentials. None of them is ever logged or returned in a body.
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { CookieOptions } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { signToken, verifyToken } from "../utils/tokens";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const SESSION_COOKIE = "session";
export const GOOGLE_STATE_COOKIE = "google_oauth_state";

// ---------- session ----------
// The session is a signed JWT (subject = user id) in an httpOnly cookie:
//  - httpOnly: page JavaScript can't read it, so an XSS bug can't steal it
//  - SameSite=Lax: the browser doesn't send it on cross-site POST/DELETE
//    requests, which blocks CSRF against our API
//  - Secure in production only, because local dev runs on plain http

export function sessionCookieOptions(): CookieOptions {
  return { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production", path: "/" };
}

export function createSessionToken(userId: string): string {
  return signToken("session", userId, env.SESSION_TTL_MS);
}

// Returns the user id, or null for a missing, tampered or expired cookie.
export function verifySessionToken(token: unknown): string | null {
  return verifyToken("session", token);
}

// ---------- OAuth state (CSRF protection) ----------
// We create a random nonce and send it two ways:
//  1. inside `state`, signed and expiring, which travels through Google;
//  2. in a short-lived httpOnly cookie, which stays in this browser.
// The callback requires both to match. The signature means nobody can forge
// a state or reuse an old one. The cookie means the callback must come from
// the same browser that started the login. That stops "login CSRF", where an
// attacker sends you their own callback link to log you into THEIR account.

export function googleStateCookieOptions(): CookieOptions {
  return { ...sessionCookieOptions(), path: "/auth/google", maxAge: env.GOOGLE_STATE_TTL_MS };
}

export function startGoogleLogin(): { url: string; nonce: string } {
  const nonce = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    response_type: "code",
    scope: "openid email profile",
    state: signToken("google-oauth", nonce, env.GOOGLE_STATE_TTL_MS),
    prompt: "select_account", // let the user pick an account instead of silently reusing one
  });
  return { url: `${AUTHORIZE_URL}?${params}`, nonce };
}

export function isValidGoogleState(state: unknown, cookieNonce: unknown): boolean {
  const nonce = verifyToken("google-oauth", state);
  if (!nonce || typeof cookieNonce !== "string") return false;
  const a = Buffer.from(nonce);
  const b = Buffer.from(cookieNonce);
  // timingSafeEqual: comparison time doesn't reveal how many characters matched.
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------- callback ----------

interface GoogleUserInfo {
  sub?: string; // Google's stable user id
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

// Trade the one-time code for an access token, read the profile, and upsert
// the user. We call Google's userinfo endpoint instead of decoding the
// id_token: the answer comes straight from Google over TLS, so there's no
// token signature for us to check.
export async function loginWithGoogleCode(code: string) {
  const signal = () => AbortSignal.timeout(env.GOOGLE_HTTP_TIMEOUT_MS);

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_CALLBACK_URL,
      grant_type: "authorization_code",
    }),
    signal: signal(),
  });
  const tokens = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokens.access_token) {
    // Only the status and Google's short error code, never the response body.
    throw new Error(`token exchange failed (HTTP ${tokenRes.status}${tokens.error ? `, ${tokens.error}` : ""})`);
  }

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: signal(),
  });
  const info = (await infoRes.json()) as GoogleUserInfo;
  if (!infoRes.ok || !info.sub || !info.email) throw new Error(`userinfo failed (HTTP ${infoRes.status})`);
  if (info.email_verified === false) throw new Error("Google email is not verified");

  // googleId is the key: a user who changes their Gmail name or photo keeps
  // the same account, and the profile is refreshed on every login.
  const profile = { email: info.email.toLowerCase(), name: info.name ?? info.email, avatarUrl: info.picture ?? null };
  const byGoogleId = await prisma.user.findUnique({ where: { googleId: info.sub } });
  if (byGoogleId) return prisma.user.update({ where: { id: byGoogleId.id }, data: profile });

  // First Google login for an email that already has a password account:
  // Google has verified that this person owns the email, but password signup
  // doesn't verify emails, so the password may have been set by someone else.
  // Link the account to Google and REMOVE the password, so only the verified
  // owner can get in. (Trade-off in the README.)
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    return prisma.user.update({ where: { id: byEmail.id }, data: { ...profile, googleId: info.sub, passwordHash: null } });
  }
  return prisma.user.create({ data: { googleId: info.sub, ...profile } });
}
