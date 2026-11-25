// Elasticsearch: a search copy of the emails table. Postgres stays the source
// of truth; this index can be thrown away and rebuilt (npm run reindex).
// Optional: without ELASTICSEARCH_URL every write here is a quiet no-op and
// search runs on Postgres instead (see emails.service).
import type { EmailStatus } from "@prisma/client";
import type { Client } from "@elastic/elasticsearch";
import { es, searchEnabled } from "../config/elasticsearch";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { htmlToText } from "../utils/html";

const INDEX = env.ELASTICSEARCH_INDEX;

// Explicit mapping. "strict" rejects unknown fields instead of guessing types.
const MAPPINGS = {
  dynamic: "strict",
  properties: {
    userId: { type: "keyword" },
    senderId: { type: "keyword" },
    batchId: { type: "keyword" },
    // text = analysed for search ("alice@example.com" -> "alice", "example.com");
    // .keyword sub-field keeps the exact value for exact matches.
    to: { type: "text", fields: { keyword: { type: "keyword" } } },
    subject: { type: "text" },
    body: { type: "text" },
    status: { type: "keyword" },
    scheduledAt: { type: "date" },
    sentAt: { type: "date" },
    createdAt: { type: "date" },
  },
} as const;

// What we need from a row (+ its batch) to build a document.
export interface EmailForIndex {
  id: string;
  userId: string;
  senderId: string;
  batchId: string;
  toEmail: string;
  status: EmailStatus;
  scheduledAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface BatchText {
  subject: string;
  body: string;
}

// ---------- index lifecycle ----------

let indexReady = false;

// For code paths that only run with ES configured (reindex, search).
function client(): Client {
  if (!es) throw new Error("ELASTICSEARCH_URL is not set");
  return es;
}

export async function createIndex(): Promise<void> {
  await client().indices.create({ index: INDEX, mappings: MAPPINGS });
}

// Create the index if it's missing. Called on boot and lazily before writes,
// so if ES was down at boot, the first write after it comes back still gets
// our mapping (otherwise ES would auto-create the index with guessed types).
export async function ensureIndex(): Promise<boolean> {
  if (!searchEnabled) return false;
  if (indexReady) return true;
  try {
    if (!(await client().indices.exists({ index: INDEX }))) await createIndex();
    indexReady = true;
  } catch (err) {
    // Two processes booting at once: the second create fails harmlessly.
    if (errorType(err) === "resource_already_exists_exception") indexReady = true;
    else warn("ensure index", err);
  }
  return indexReady;
}

// ---------- writes ----------

// ES writes are fire-and-forget (see syncToSearch), so two updates for the same
// email could reach ES out of order. Each write therefore carries
// version = row.updatedAt in ms with version_type "external": ES keeps the
// highest version and rejects older ones with a 409, which we ignore.
export async function indexEmails(items: { email: EmailForIndex; batch: BatchText }[]) {
  let indexed = 0;
  let conflicts = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += env.ES_BULK_BATCH_SIZE) {
    const chunk = items.slice(i, i + env.ES_BULK_BATCH_SIZE);
    const operations = chunk.flatMap(({ email, batch }) => [
      { index: { _index: INDEX, _id: email.id, version: email.updatedAt.getTime(), version_type: "external" as const } },
      {
        userId: email.userId,
        senderId: email.senderId,
        batchId: email.batchId,
        to: email.toEmail,
        subject: batch.subject,
        body: htmlToText(batch.body), // index words, not tags ("strong" shouldn't match <strong>)
        status: email.status,
        scheduledAt: email.scheduledAt,
        sentAt: email.sentAt,
        createdAt: email.createdAt,
      },
    ]);
    const res = await client().bulk({ operations });
    for (const item of res.items) {
      const status = item.index?.status ?? 0;
      if (status === 409) conflicts++; // an equal/newer version is already there: fine
      else if (status >= 300) failed++;
      else indexed++;
    }
  }
  return { indexed, conflicts, failed };
}

// What the API and worker call. Never awaited, never throws: a slow or dead
// ES must not hold up scheduling or sending. Lost writes are fixed by reindex.
export function syncToSearch(items: { email: EmailForIndex; batch: BatchText }[]): void {
  if (!searchEnabled || items.length === 0) return;
  void (async () => {
    if (!(await ensureIndex())) return;
    const { failed } = await indexEmails(items);
    if (failed > 0) warn("index", new Error(`${failed} of ${items.length} documents rejected`));
  })().catch((err) => warn("index", err));
}

// ---------- search ----------

export async function searchEmailIds(
  userId: string,
  opts: { q: string; statuses?: EmailStatus[]; page: number; limit: number },
): Promise<{ ids: string[]; total: number }> {
  try {
    const res = await client().search<unknown>({
      index: INDEX,
      from: (opts.page - 1) * opts.limit,
      size: opts.limit,
      track_total_hits: true,
      _source: false, // we only need ids; display data comes from Postgres
      query: {
        bool: {
          must: opts.q ? wordClauses(opts.q) : { match_all: {} },
          // filter = must match, but doesn't affect relevance score (and is cacheable)
          filter: [{ term: { userId } }, ...(opts.statuses ? [{ terms: { status: opts.statuses } }] : [])],
        },
      },
      sort: opts.q ? ["_score", { scheduledAt: "desc" }] : [{ scheduledAt: "desc" }],
    });
    const total = typeof res.hits.total === "number" ? res.hits.total : (res.hits.total?.value ?? 0);
    return { ids: res.hits.hits.map((h) => h._id as string), total };
  } catch (err) {
    warn("search", err);
    throw new AppError(503, "Search is temporarily unavailable", "SearchUnavailable");
  }
}

// ---------- helpers ----------

// Every word the user typed must appear somewhere (recipient, subject or body),
// but different words may come from different fields: "partnership marigold"
// matches a subject with one and a body with the other.
//   - operator "and" inside a word: "bob@example.com" splits into "bob" +
//     "example.com", and both must match - not everyone at example.com.
//   - bool_prefix: each word may be the start of a word ("mari" -> marigold).
//     Needed for addresses too: the analyzer keeps "john.doe" as ONE token,
//     so plain "john" would only match it as a prefix.
function wordClauses(q: string) {
  const words = q.split(/\s+/).filter(Boolean);
  return words.map((word) => ({
    multi_match: {
      query: word,
      type: "bool_prefix" as const,
      operator: "and" as const,
      fields: ["to^2", "subject^2", "body"], // ^2 = matches here rank higher
    },
  }));
}

// The ES client's ConnectionError (ES down) has an EMPTY message, so the
// name and HTTP status are what actually tell you what happened.
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const status = (err as { meta?: { statusCode?: number } }).meta?.statusCode;
  return [err.name, err.message, status ? `HTTP ${status}` : ""].filter(Boolean).join(": ");
}

function errorType(err: unknown): string | undefined {
  return (err as { meta?: { body?: { error?: { type?: string } } } })?.meta?.body?.error?.type;
}

// When ES is down, every email would log a warning. Log at most one line
// per interval and say how many were suppressed.
const WARN_INTERVAL_MS = 10_000;
let lastWarnAt = 0;
let suppressed = 0;
function warn(action: string, err: unknown) {
  if (Date.now() - lastWarnAt < WARN_INTERVAL_MS) {
    suppressed++;
    return;
  }
  const message = describeError(err).slice(0, 160);
  logger.warn(`[search] ${action} failed: ${message}${suppressed ? ` (+${suppressed} similar suppressed)` : ""}`);
  lastWarnAt = Date.now();
  suppressed = 0;
}
