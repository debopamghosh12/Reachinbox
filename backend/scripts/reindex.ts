// Rebuilds the Elasticsearch index from Postgres (the source of truth).
//   npm run reindex
// Use after ES was down, lost data, or the mapping changed. While it runs,
// search may return partial results.
import { env } from "../src/config/env";
import { es } from "../src/config/elasticsearch";
import { prisma } from "../src/config/prisma";
import { createIndex, indexEmails } from "../src/services/search.service";

async function main() {
  const index = env.ELASTICSEARCH_INDEX;
  const t0 = Date.now();

  // Drop and recreate, so the mapping is always the current one.
  await es.indices.delete({ index, ignore_unavailable: true });
  await createIndex();

  let total = 0;
  let failed = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.email.findMany({
      orderBy: { id: "asc" },
      take: env.ES_BULK_BATCH_SIZE,
      include: { batch: { select: { subject: true, body: true } } },
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;

    const result = await indexEmails(rows.map((row) => ({ email: row, batch: row.batch })));
    total += rows.length;
    failed += result.failed;
    cursor = rows[rows.length - 1].id;
    process.stdout.write(`\r  indexed ${total} rows...`);
  }

  await es.indices.refresh({ index });
  const { count } = await es.count({ index });
  const pgCount = await prisma.email.count();
  console.log(`\nReindex done in ${Date.now() - t0}ms: Postgres rows=${pgCount}, ES docs=${count}, failed=${failed}`);
  return count === pgCount && failed === 0;
}

main()
  .then(async (ok) => {
    await Promise.allSettled([prisma.$disconnect(), es.close()]);
    process.exit(ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("Reindex failed:", err instanceof Error ? err.message : err);
    await Promise.allSettled([prisma.$disconnect(), es.close()]);
    process.exit(1);
  });
