import type { EmailStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import type { ListQuery } from "../schemas/email.schemas";

// The "Scheduled" tab also shows rows currently being sent - from the user's
// point of view they haven't been sent yet.
const STATUS_FILTER: Record<NonNullable<ListQuery["status"]>, EmailStatus[]> = {
  scheduled: ["scheduled", "sending"],
  sent: ["sent"],
  failed: ["failed"],
};

export async function listEmails(userId: string, { status, page, limit }: ListQuery) {
  const where: Prisma.EmailWhereInput = {
    userId,
    ...(status && { status: { in: STATUS_FILTER[status] } }),
  };

  // Upcoming emails: soonest first. Finished emails: most recent first.
  const orderBy: Prisma.EmailOrderByWithRelationInput =
    !status || status === "scheduled" ? { scheduledAt: "asc" } : { updatedAt: "desc" };

  const [rows, total] = await prisma.$transaction([
    prisma.email.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        batch: { select: { subject: true } },
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);

  return {
    items: rows.map((e) => ({
      id: e.id,
      toEmail: e.toEmail,
      subject: e.batch.subject,
      senderEmail: e.sender.email,
      status: e.status,
      scheduledAt: e.scheduledAt,
      sentAt: e.sentAt,
      previewUrl: e.previewUrl,
      error: e.error,
    })),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}
