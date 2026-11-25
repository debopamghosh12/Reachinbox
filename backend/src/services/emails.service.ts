import type { EmailStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { searchEnabled } from "../config/elasticsearch";
import type { ListQuery, SearchQuery } from "../schemas/email.schemas";
import { searchEmailIds } from "./search.service";
import { isHtml, toPreview } from "../utils/html";

// The "Scheduled" tab also shows rows currently being sent - from the user's
// point of view they haven't been sent yet. The "Sent" tab shows finished
// emails: sent AND failed (the failed ones carry a red pill and the error).
const STATUS_FILTER: Record<NonNullable<ListQuery["status"]>, EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent", "failed"],
  failed: ["failed"],
};

// Length of the one-line plain-text preview in list rows (a display choice,
// not a sending limit).
const PREVIEW_CHARS = 140;

const listInclude = {
  batch: { select: { subject: true, body: true } },
  sender: { select: { email: true, name: true } },
} satisfies Prisma.EmailInclude;

type ListRow = Prisma.EmailGetPayload<{ include: typeof listInclude }>;

// One item shape for every list-like endpoint. The full body stays out of
// lists (a page of 100 rows x a large body adds up); the detail endpoint has it.
function toListItem(e: ListRow) {
  return {
    id: e.id,
    toEmail: e.toEmail,
    subject: e.batch.subject,
    bodyPreview: toPreview(e.batch.body, PREVIEW_CHARS),
    senderEmail: e.sender.email,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    previewUrl: e.previewUrl,
    error: e.error,
  };
}

// The detail view: the list item plus the full body. The where clause has
// BOTH id and userId, so another user's email is simply "not found".
export async function getEmail(userId: string, id: string) {
  const row = await prisma.email.findFirst({ where: { id, userId }, include: listInclude });
  if (!row) return null;
  return {
    ...toListItem(row),
    senderName: row.sender.name,
    body: row.batch.body, // already sanitized when it was scheduled
    bodyFormat: isHtml(row.batch.body) ? ("html" as const) : ("text" as const),
  };
}

function page<T>(items: T[], total: number, pageNo: number, limit: number) {
  return { items, page: pageNo, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function listEmails(userId: string, { status, page: pageNo, limit }: ListQuery) {
  const where: Prisma.EmailWhereInput = {
    userId,
    ...(status && { status: { in: STATUS_FILTER[status] } }),
  };

  // Upcoming emails: soonest first. Finished emails: most recent first.
  const orderBy: Prisma.EmailOrderByWithRelationInput =
    !status || status === "scheduled" ? { scheduledAt: "asc" } : { updatedAt: "desc" };

  const [rows, total] = await prisma.$transaction([
    prisma.email.findMany({ where, orderBy, skip: (pageNo - 1) * limit, take: limit, include: listInclude }),
    prisma.email.count({ where }),
  ]);

  return page(rows.map(toListItem), total, pageNo, limit);
}

// Elasticsearch finds the matching ids (full-text), Postgres supplies the rows.
// So results always show the current status, even if the index lags slightly.
export async function searchEmails(userId: string, query: SearchQuery) {
  if (!searchEnabled) return searchEmailsInPostgres(userId, query);
  const { q, status, page: pageNo, limit } = query;
  const { ids, total } = await searchEmailIds(userId, {
    q,
    statuses: status && STATUS_FILTER[status],
    page: pageNo,
    limit,
  });

  const rows = await prisma.email.findMany({ where: { id: { in: ids }, userId }, include: listInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Keep ES relevance order; skip ids whose row no longer exists.
  const items = ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toListItem(row)] : [];
  });

  return page(items, total, pageNo, limit);
}

// Used when ELASTICSEARCH_URL is not set. Same rule as the ES query: every
// word must appear in the recipient, subject or body (case-insensitive
// ILIKE '%word%'), and different words may come from different fields.
// No relevance ranking and no index, so it's a full scan per user: fine for a
// demo, not for millions of rows. The body is matched as stored (HTML), so a
// word that only appears inside a tag can match too.
async function searchEmailsInPostgres(userId: string, { q, status, page: pageNo, limit }: SearchQuery) {
  const words = q.split(/\s+/).filter(Boolean);
  const where: Prisma.EmailWhereInput = {
    userId,
    ...(status && { status: { in: STATUS_FILTER[status] } }),
    AND: words.map((word) => ({
      OR: [
        { toEmail: { contains: word, mode: "insensitive" as const } },
        { batch: { subject: { contains: word, mode: "insensitive" as const } } },
        { batch: { body: { contains: word, mode: "insensitive" as const } } },
      ],
    })),
  };

  const [rows, total] = await prisma.$transaction([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: "desc" },
      skip: (pageNo - 1) * limit,
      take: limit,
      include: listInclude,
    }),
    prisma.email.count({ where }),
  ]);

  return page(rows.map(toListItem), total, pageNo, limit);
}
