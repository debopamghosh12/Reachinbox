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
  FRONTEND_URL: z.url(),
  JSON_BODY_LIMIT: z.string().min(1), // e.g. "2mb" - bounds the leads payload

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  WORKER_CONCURRENCY: positiveInt,
  MIN_DELAY_MS: nonNegativeInt, // 0 disables the limiter
  MAX_EMAILS_PER_HOUR_PER_SENDER: positiveInt,
  JOB_ATTEMPTS: positiveInt,
  JOB_BACKOFF_MS: positiveInt,
  JOB_RETENTION_HOURS: positiveInt,
  STUCK_SENDING_MS: positiveInt,
  MAX_LEADS_PER_REQUEST: positiveInt,

  PAGE_SIZE_DEFAULT: positiveInt,
  PAGE_SIZE_MAX: positiveInt,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
