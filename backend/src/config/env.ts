// Single source of truth for configuration.
// Parsed once at startup: if anything is missing or malformed we crash immediately
// with a clear message, instead of failing later in the middle of sending emails.
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

// Limits deliberately have NO defaults here: they must be set explicitly in .env,
// so nothing about sending behaviour is hardcoded in the code.
const positiveInt = z.coerce.number().int().positive();
const nonNegativeInt = z.coerce.number().int().nonnegative();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: positiveInt,
  // No trailing slash: CORS compares the origin as an exact string.
  FRONTEND_URL: z.url().transform((u) => u.replace(/\/+$/, "")),
  JSON_BODY_LIMIT: z.string().min(1), // e.g. "2mb" - bounds the leads payload

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  WORKER_CONCURRENCY: positiveInt,
  MIN_DELAY_MS: nonNegativeInt, // 0 disables the limiter
  MAX_EMAILS_PER_HOUR_PER_SENDER: positiveInt,
  JOB_ATTEMPTS: positiveInt,
  JOB_BACKOFF_MS: positiveInt,
  JOB_RETENTION_HOURS: positiveInt,
  STUCK_SENDING_THRESHOLD_MS: positiveInt,
  MAX_LEADS_PER_REQUEST: positiveInt,
  // Spacing (per seq number) added when a job is pushed to a later hour, to keep order.
  RESCHEDULE_SEQ_OFFSET_MS: nonNegativeInt,
  RECONCILE_BATCH_SIZE: positiveInt,
  // Max time to wait for in-flight jobs on shutdown before exiting anyway.
  SHUTDOWN_TIMEOUT_MS: positiveInt,
  // true = worker skips the real SMTP call (load tests). Not a limit, so it has a default.
  SMTP_DRY_RUN: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),

  PAGE_SIZE_DEFAULT: positiveInt,
  PAGE_SIZE_MAX: positiveInt,

  // Signs session cookies and OAuth states (see utils/tokens.ts).
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  SESSION_TTL_MS: positiveInt,

  // Google login is required: there is no other way to use the app.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.url(),
  GOOGLE_STATE_TTL_MS: positiveInt,
  GOOGLE_HTTP_TIMEOUT_MS: positiveInt,

  // Comma-separated emails allowed to open bull-board (/admin/queues).
  // Empty = nobody, which is the safe default.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)),

  ELASTICSEARCH_URL: z.url(),
  ELASTICSEARCH_INDEX: z.string().min(1),
  ES_REQUEST_TIMEOUT_MS: positiveInt,
  ES_BULK_BATCH_SIZE: positiveInt,

  // Slack is optional: without credentials the app still runs, /auth/slack
  // answers 503 and rate-limit notifications are skipped.
  SLACK_CLIENT_ID: z.string().min(1).optional(),
  SLACK_CLIENT_SECRET: z.string().min(1).optional(),
  // Public https URL that reaches this API (ngrok/cloudflared). Slack only
  // redirects to https, so the callback is built from this.
  PUBLIC_BASE_URL: z.url().transform((u) => u.replace(/\/+$/, "")).optional(),
  SLACK_STATE_TTL_MS: positiveInt,
  SLACK_HTTP_TIMEOUT_MS: positiveInt,
});

// dotenv turns `KEY=` into "" - treat that as "not set" so optional keys stay optional.
const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
const parsed = envSchema.safeParse(raw);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
