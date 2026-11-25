// Creates SEED_SENDER_COUNT Ethereal test accounts and stores them as senders.
// Safe to re-run: it only creates the missing ones. The API also runs this on
// startup when the senders table is empty (see services/seedSenders.ts).
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { seedSenders } from "../src/services/seedSenders";

const prisma = new PrismaClient();

async function main() {
  const target = Number(process.env.SEED_SENDER_COUNT ?? 3);
  const created = await seedSenders(prisma, target);
  console.log(created === 0 ? `Already have at least ${target} senders. Nothing to do.` : `Created ${created} senders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
