// Load test: schedules N emails "at once" through the real API, waits until the
// worker(s) have processed every due job, then checks the hourly limit held.
//
//   npm run loadtest -- --leads 1200 --hourly-limit 5 [--reset-counters] [--keep]
//
// Run the API and worker(s) with SMTP_DRY_RUN=true (and a small MIN_DELAY_MS) first.
// --reset-counters deletes this hour's rate-limit keys for all senders (dev only).
// Without --keep, the test's rows and jobs are deleted at the end.
import { parseArgs } from "node:util";
import { env } from "../src/config/env";
import { prisma } from "../src/config/prisma";
import { redis } from "../src/config/redis";
import { emailQueue } from "../src/queue/emailQueue";
import { hourWindow } from "../src/queue/rateLimiter";

const { values: args } = parseArgs({
  options: {
    leads: { type: "string", default: "1200" },
    "hourly-limit": { type: "string", default: "5" },
    "timeout-s": { type: "string", default: "300" },
    "reset-counters": { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
  },
});
const N = Number(args.leads);
const LIMIT = Number(args["hourly-limit"]);

const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ check: name, ok, detail });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const senders = await prisma.sender.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const window = hourWindow();
  const effectiveLimit = Math.min(LIMIT, env.MAX_EMAILS_PER_HOUR_PER_SENDER);

  if (args["reset-counters"]) {
    const keys = senders.flatMap((s) => [`rl:${s.id}:${window.key}`, `ov:${s.id}:${window.key}`, `rl-notified:${s.id}:${window.key}`]);
    await redis.del(...keys);
    console.log(`Reset rate-limit keys for window ${window.key}`);
  }
  const countersBefore = await Promise.all(senders.map(async (s) => Number((await redis.get(`rl:${s.id}:${window.key}`)) ?? 0)));

  // 1) Schedule through the real HTTP endpoint.
  const tag = Date.now();
  const leads = Array.from({ length: N }, (_, i) => `lt${tag}-${i}@loadtest.example`);
  const t0 = performance.now();
  const res = await fetch(`http://localhost:${env.PORT}/api/emails/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject: `Load test ${tag}`, body: "load test", leads, startTime: new Date().toISOString(), delayBetweenMs: 0, hourlyLimit: LIMIT }),
  });
  const scheduleMs = Math.round(performance.now() - t0);
  const body = (await res.json()) as { batchId: string; count: number };
  if (!res.ok) throw new Error(`schedule failed: ${res.status} ${JSON.stringify(body)}`);
  console.log(`Scheduled ${body.count} emails in ${scheduleMs}ms (HTTP ${res.status}), batch ${body.batchId}`);
  check("schedule API handles N leads", body.count === N, `${body.count} rows in ${scheduleMs}ms`);
  const batchId = body.batchId;

  // 2) Wait until nothing is due any more (every job either sent or pushed to the future).
  const deadline = Date.now() + Number(args["timeout-s"]) * 1000;
  const tWait = Date.now();
  let due = N;
  while (Date.now() < deadline) {
    due = await prisma.email.count({ where: { batchId, status: { in: ["scheduled", "sending"] }, scheduledAt: { lte: new Date() } } });
    const sent = await prisma.email.count({ where: { batchId, status: "sent" } });
    process.stdout.write(`\r  waiting... due=${due} sent=${sent}   `);
    if (due === 0) break;
    await sleep(1000);
  }
  console.log(`\nAll due jobs processed in ${Math.round((Date.now() - tWait) / 1000)}s`);
  check("every due job was processed", due === 0, `due remaining = ${due}`);

  // 3) Collect results.
  const rows = await prisma.email.findMany({ where: { batchId }, select: { id: true, seq: true, senderId: true, status: true, attempts: true, scheduledAt: true } });
  const byStatus = rows.reduce<Record<string, number>>((acc, r) => ((acc[r.status] = (acc[r.status] ?? 0) + 1), acc), {});
  const moved = rows.filter((r) => r.status === "scheduled" && r.scheduledAt.getTime() >= window.end);
  const sent = rows.filter((r) => r.status === "sent");

  console.log("\nDB status counts:", byStatus);
  console.log(`Pushed to later hour windows: ${moved.length}`);

  const expectedSent = senders.reduce((sum, _s, i) => sum + Math.max(0, effectiveLimit - countersBefore[i]), 0);
  check("sent == free hourly capacity", sent.length === Math.min(N, expectedSent), `sent ${sent.length}, expected ${Math.min(N, expectedSent)} (${senders.length} senders x limit ${effectiveLimit}, minus ${countersBefore.join("/")} already used)`);
  check("no job failed", (byStatus.failed ?? 0) === 0, `failed = ${byStatus.failed ?? 0}`);
  check("nothing lost (sent + moved == N)", sent.length + moved.length === N, `${sent.length} + ${moved.length} = ${sent.length + moved.length}`);
  check("no row sent more than once", sent.every((r) => r.attempts === 1), `max attempts on sent rows = ${Math.max(0, ...sent.map((r) => r.attempts))}`);

  // Redis counters must never exceed the limit.
  const counters = await Promise.all(senders.map(async (s) => Number((await redis.get(`rl:${s.id}:${window.key}`)) ?? 0)));
  console.log("Redis counters this window:", Object.fromEntries(senders.map((s, i) => [s.name, counters[i]])));
  check("Redis counter <= limit for every sender", counters.every((c) => c <= effectiveLimit), counters.join(", "));

  // Future windows: how the moved jobs were spread, and never more than `limit` per sender per window.
  const perWindow = new Map<string, number>();
  for (const r of moved) {
    const k = `${hourWindow(r.scheduledAt.getTime()).key}|${r.senderId}`;
    perWindow.set(k, (perWindow.get(k) ?? 0) + 1);
  }
  const windows = [...new Set([...perWindow.keys()].map((k) => k.split("|")[0]))].sort();
  console.log(`Moved jobs spread over ${windows.length} future windows (${windows[0]} .. ${windows[windows.length - 1]})`);
  const maxPerSenderWindow = Math.max(0, ...perWindow.values());
  check("future windows planned within limit", maxPerSenderWindow <= effectiveLimit, `max ${maxPerSenderWindow} per sender per window`);

  // Every moved row must still have a delayed job in Redis.
  const states = await Promise.all(moved.map(async (r) => (await emailQueue.getJob(r.id))?.getState()));
  const delayed = states.filter((s) => s === "delayed").length;
  check("every moved row has a delayed job", delayed === moved.length, `${delayed}/${moved.length} delayed`);

  // Order: within each sender, scheduledAt should follow seq.
  let inversions = 0;
  for (const s of senders) {
    const mine = moved.filter((r) => r.senderId === s.id).sort((a, b) => a.seq - b.seq);
    for (let i = 1; i < mine.length; i++) if (mine[i].scheduledAt < mine[i - 1].scheduledAt) inversions++;
  }
  check("order preserved (seq vs new time)", inversions === 0, `${inversions} inversions`);

  // 4) Report.
  console.log("\n=== RESULT ===");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.check.padEnd(40)} ${r.detail}`);

  // 5) Cleanup.
  if (!args.keep) {
    await Promise.all(rows.map(async (r) => (await emailQueue.getJob(r.id))?.remove()));
    await prisma.email.deleteMany({ where: { batchId } });
    await prisma.batch.delete({ where: { id: batchId } });
    console.log(`\nCleaned up ${rows.length} rows and their jobs (this hour's rate counters are left to expire).`);
  }

  return results.every((r) => r.ok);
}

main()
  .then(async (ok) => {
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit()]);
    process.exit(ok ? 0 : 1);
  })
  .catch(async (err) => {
    console.error(err);
    await Promise.allSettled([emailQueue.close(), prisma.$disconnect(), redis.quit()]);
    process.exit(1);
  });
