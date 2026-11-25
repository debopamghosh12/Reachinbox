// Creates Ethereal test accounts and stores them as senders, up to `target`.
// Used by `npm run db:seed` and by the API on startup (only when the table is
// empty), so a fresh hosted database works without a manual seed step.
import nodemailer from "nodemailer";
import type { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

// nodemailer caches the first test account in memory and returns it on every
// later createTestAccount() call in the same process (ETHEREAL_CACHE defaults
// to "yes"). We need a NEW mailbox per sender, so turn the cache off.
process.env.ETHEREAL_CACHE = "no";

// Arbitrary constant: the key of the Postgres advisory lock that serializes
// seeding, so two processes booting at once can't both fill the table.
const SEED_LOCK_KEY = 482_190_331;

// Safe to run any number of times, from several processes at once: the
// count is re-read under the lock, so it only ever adds the missing senders.
// Returns how many senders were created.
export async function seedSenders(prisma: PrismaClient, target: number): Promise<number> {
  const missing = target - (await prisma.sender.count());
  if (missing <= 0) return 0;

  // Ethereal's API is called OUTSIDE the transaction, so a slow network
  // doesn't hold a database transaction (and the lock) open.
  const accounts: Awaited<ReturnType<typeof nodemailer.createTestAccount>>[] = [];
  for (let i = 0; i < missing; i++) accounts.push(await nodemailer.createTestAccount());

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEED_LOCK_KEY})`;
    const existing = await tx.sender.count();
    const toCreate = accounts.slice(0, Math.max(0, target - existing));
    for (const [i, account] of toCreate.entries()) {
      const sender = await tx.sender.create({
        data: {
          name: `Sender ${existing + i + 1}`,
          email: account.user,
          smtpHost: account.smtp.host,
          smtpPort: account.smtp.port,
          smtpUser: account.user,
          smtpPass: account.pass,
        },
      });
      logger.info(`[seed] created ${sender.name}: ${sender.email} (login at https://ethereal.email with pass ${account.pass})`);
    }
    return toCreate.length;
  });
}

// Startup hook: seeds only when there are NO senders at all, and never
// crashes the API (Ethereal being down just means no senders yet).
export async function seedSendersIfEmpty(prisma: PrismaClient, target: number): Promise<void> {
  try {
    if ((await prisma.sender.count()) > 0) return;
    logger.info(`[seed] no senders found, creating ${target} Ethereal senders...`);
    await seedSenders(prisma, target);
  } catch (err) {
    logger.error("[seed] could not create senders (run `npm run db:seed` later)", err);
  }
}
