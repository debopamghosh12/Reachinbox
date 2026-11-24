// Short-lived signed tokens (JWT, HS256), used for the login session and for
// the Google and Slack OAuth states.
// The audience says what a token is FOR. Verification checks it, so a token
// made for one purpose is rejected everywhere else (e.g. a Slack OAuth state
// can never be replayed as a login session cookie).
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export type TokenAudience = "session" | "google-oauth" | "slack-oauth";

export function signToken(audience: TokenAudience, subject: string, ttlMs: number): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: "HS256",
    audience,
    subject,
    expiresIn: Math.floor(ttlMs / 1000), // jsonwebtoken counts in seconds
  });
}

// Returns the token's subject, or null if it is missing, forged, tampered
// with, expired, or was made for a different audience.
export function verifyToken(audience: TokenAudience, token: unknown): string | null {
  if (typeof token !== "string" || !token) return null;
  try {
    // Pinning the algorithm stops an attacker from choosing a weaker one (e.g. "none").
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"], audience });
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
