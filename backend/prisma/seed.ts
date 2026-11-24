// Creates SEED_SENDER_COUNT Ethereal test accounts and stores them as senders.
// Safe to re-run: it only creates the missing ones.
import "dotenv/config";
import nodemailer from "nodemailer";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const target = Number(process.env.SEED_SENDER_COUNT ?? 3);
  const existing = await prisma.sender.count();

  if (existing >= target) {
    console.log(`Already have ${existing} senders (target ${target}). Nothing to do.`);
    return;
  }

  for (let i = existing; i < target; i++) {
    // Hits Ethereal's API and returns a fresh SMTP mailbox.
    const account = await nodemailer.createTestAccount();
    const sender = await prisma.sender.create({
      data: {
        name: `Sender ${i + 1}`,
        email: account.user,
        smtpHost: account.smtp.host,
        smtpPort: account.smtp.port,
        smtpUser: account.user,
        smtpPass: account.pass,
      },
    });
    console.log(`Created ${sender.name}: ${sender.email} (login at https://ethereal.email with pass ${account.pass})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
