// Slack OAuth v2 (incoming-webhook scope) + posting to a stored webhook.
// SECURITY: webhook URLs, tokens and the client secret are credentials.
// They are never logged or returned by the API; errors carry status codes only.
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

const AUTHORIZE_URL = "https://slack.com/oauth/v2/authorize";
const TOKEN_URL = "https://slack.com/api/oauth.v2.access";
const REVOKE_URL = "https://slack.com/api/auth.revoke";
const STATE_AUDIENCE = "slack-oauth"; // a state token is useless anywhere else

export function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.PUBLIC_BASE_URL);
}

// Slack sends the browser to this exact URL, and it must also be listed under
// "Redirect URLs" in the Slack app settings.
function redirectUri(): string {
  return `${env.PUBLIC_BASE_URL}/auth/slack/callback`;
}

// ---------- OAuth state (CSRF protection) ----------
// The callback arrives on the public tunnel domain, where the browser has no
// session cookie for us, so the state must itself say WHO started the flow.
// A signed, expiring JWT does that: it can't be forged without JWT_SECRET,
// and it stops working after SLACK_STATE_TTL_MS.

export function createState(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    audience: STATE_AUDIENCE,
    expiresIn: Math.floor(env.SLACK_STATE_TTL_MS / 1000),
  });
}

// Returns the user id, or null if the state is missing, forged or expired.
export function verifyState(state: unknown): string | null {
  if (typeof state !== "string" || !state) return null;
  try {
    const payload = jwt.verify(state, env.JWT_SECRET, { audience: STATE_AUDIENCE });
    return typeof payload === "object" && typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID!,
    scope: "incoming-webhook",
    redirect_uri: redirectUri(),
    state: createState(userId),
  });
  return `${AUTHORIZE_URL}?${params}`;
}

// ---------- code exchange + storage ----------

interface OAuthV2Response {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id: string; name?: string };
  incoming_webhook?: { url: string; channel?: string; channel_id?: string };
}

export async function connectWithCode(userId: string, code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.SLACK_CLIENT_ID!,
      client_secret: env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri(), // must match the one used in /authorize
    }),
    signal: AbortSignal.timeout(env.SLACK_HTTP_TIMEOUT_MS),
  });
  const data = (await res.json()) as OAuthV2Response;
  if (!data.ok || !data.incoming_webhook?.url || !data.team?.id) {
    // data.error is a short code like "invalid_code" - safe to log.
    throw new AppError(502, `Slack OAuth exchange failed: ${data.error ?? "no incoming webhook in response"}`, "SlackOAuthFailed");
  }

  const fields = {
    teamId: data.team.id,
    teamName: data.team.name ?? null,
    channel: data.incoming_webhook.channel ?? null,
    channelId: data.incoming_webhook.channel_id ?? null,
    webhookUrl: data.incoming_webhook.url,
    accessToken: data.access_token ?? null, // kept only to revoke on disconnect
  };
  // One connection per user: reconnecting replaces the old one.
  await prisma.slackConnection.upsert({ where: { userId }, create: { userId, ...fields }, update: fields });
}

// ---------- status / disconnect ----------

export async function getSlackStatus(userId: string) {
  const conn = await prisma.slackConnection.findUnique({ where: { userId }, select: { channel: true } });
  return { connected: Boolean(conn), channel: conn?.channel ?? null };
}

export async function disconnectSlack(userId: string): Promise<void> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return; // already disconnected: DELETE is idempotent
  await prisma.slackConnection.delete({ where: { userId } });

  // Best effort: also revoke on Slack's side so the webhook stops working
  // there too. Our row is already gone, so a failure here changes nothing for us.
  if (conn.accessToken) {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${conn.accessToken}` },
      signal: AbortSignal.timeout(env.SLACK_HTTP_TIMEOUT_MS),
    }).catch(() => undefined);
  }
}

// ---------- posting ----------

export async function postToWebhook(webhookUrl: string, message: { text: string }): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(env.SLACK_HTTP_TIMEOUT_MS),
  });
  if (!res.ok) {
    // Slack answers e.g. 404 "no_service" for a revoked webhook. The body is a
    // short code, never the URL.
    const body = (await res.text()).slice(0, 40);
    throw new Error(`Slack webhook responded ${res.status} ${body}`);
  }
}
