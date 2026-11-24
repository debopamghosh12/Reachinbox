import type { EmailStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { ListQuery, SearchQuery } from "../schemas/email.schemas";
import { searchEmailIds } from "./search.service";

// The "Scheduled" tab also shows rows currently being sent - from the user's
// point of view they haven't been sent yet.
const STATUS_FILTER: Record<NonNullable<ListQuery["status"]>, EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent"],
  failed: ["failed"],
};

const listInclude = {
  batch: { select: { subject: true } },
  sender: { select: { email: true } },
} satisfies Prisma.EmailInclude;

type ListRow = Prisma.EmailGetPayload<{ include: typeof listInclude }>;

// One item shape for every list-like endpoint.
function toListItem(e: ListRow) {
  return {
    id: e.id,
    toEmail: e.toEmail,
    subject: e.batch.subject,
    senderEmail: e.sender.email,
    status: e.status,
    scheduledAt: e.scheduledAt,
    sentAt: e.sentAt,
    previewUrl: e.previewUrl,
    error: e.error,
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
export async function searchEmails(userId: string, { q, status, page: pageNo, limit }: SearchQuery) {
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
