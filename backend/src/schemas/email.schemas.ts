import { z } from "zod";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1),
  body: z.string().min(1),
  leads: z.array(z.string()).min(1),
  // Strict ISO-8601 with timezone (e.g. 2026-11-24T10:00:00Z). A loose
  // z.coerce.date() would happily turn `null` into 1970.
  startTime: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  delayBetweenMs: z.number().int().min(0),
  hourlyLimit: z.number().int().positive(),
});

export type ScheduleInput = z.infer<typeof scheduleSchema>;

const emailFormat = z.email();

// Trim + lowercase, drop duplicates, and reject the request if any address is
// invalid (the UI already parses the CSV, so an invalid one means a real mistake).
export function normalizeLeads(raw: string[]): { leads: string[]; duplicatesRemoved: number } {
  const unique = new Set<string>();
  const invalid: string[] = [];

  for (const value of raw) {
    const email = value.trim().toLowerCase();
    if (!email) continue;
    if (!emailFormat.safeParse(email).success) invalid.push(value);
    else unique.add(email);
  }

  if (invalid.length > 0) {
    throw new AppError(400, `${invalid.length} invalid email address(es)`, "InvalidLeads", {
      invalid: invalid.slice(0, 20),
    });
  }
  if (unique.size === 0) throw new AppError(400, "No email addresses provided", "InvalidLeads");
  if (unique.size > env.MAX_LEADS_PER_REQUEST) {
    throw new AppError(400, `Too many leads: ${unique.size} (max ${env.MAX_LEADS_PER_REQUEST})`, "TooManyLeads");
  }

  return { leads: [...unique], duplicatesRemoved: raw.length - unique.size };
}

export const listQuerySchema = z.object({
  status: z.enum(["scheduled", "sent", "failed"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(env.PAGE_SIZE_MAX).default(env.PAGE_SIZE_DEFAULT),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

// Same filters/pagination as the list, plus the search text (empty = everything).
export const searchQuerySchema = listQuerySchema.extend({
  q: z.string().trim().default(""),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
