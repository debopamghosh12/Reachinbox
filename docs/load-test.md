# Load test results

Recorded on 2026-11-24 on a Windows 11 laptop (16 GB RAM), using the Docker
Compose stack from the README (Postgres 16, Redis 7). Elasticsearch was
stopped during these runs to save memory. Search indexing runs in the
background and never blocks sending, so this doesn't affect the numbers.

The test script is [`backend/scripts/loadtest.ts`](../backend/scripts/loadtest.ts).
It runs as its own user (`loadtest@outbox.test`), never touches real users'
data, and by default deletes its own rows and jobs at the end.

## Setup

The API and one worker run with these overrides. Everything else comes from
`.env.example`, including `WORKER_CONCURRENCY=5`, 3 seeded senders and 3 job attempts.

| Variable | Value | Why |
|---|---|---|
| `SMTP_DRY_RUN` | `true` | Skips the real SMTP call. Everything else (claim, rate limit, DB and Redis writes) runs for real. |
| `MIN_DELAY_MS` | `20` | Lets one test take seconds, not minutes. The default (1000) would process at most 1 job per second. |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `1000` | Restart test only, so every email can be sent within the hour. |

## Test 1: 1200 emails with a small hourly limit

```
SMTP_DRY_RUN=true MIN_DELAY_MS=20 npm run loadtest -- --leads 1200 --hourly-limit 5 --reset-counters
```

```
Reset rate-limit keys for window 2026112413
Scheduled 1200 emails in 739ms (HTTP 201), batch c70dde65-35f7-4aac-ae60-cbd9493860f4

All due jobs processed in 29s

DB status counts: { sent: 15, scheduled: 1185 }
Pushed to later hour windows: 1185
Redis counters this window: { 'Sender 1': 5, 'Sender 2': 5, 'Sender 3': 5 }
Moved jobs spread over 79 future windows (2026112414 .. 2026112720)
Jobs per future window: 15 jobs x 79 windows

=== RESULT ===
PASS  schedule API handles N leads             1200 rows in 739ms
PASS  every due job was processed              due remaining = 0
PASS  sent == free hourly capacity             sent 15, expected 15 (3 senders x limit 5, minus 0/0/0 already used)
PASS  no job failed                            failed = 0
PASS  nothing lost (sent + moved == N)         15 + 1185 = 1200
PASS  no row sent more than once               max attempts on sent rows = 1
PASS  Redis counter <= limit for every sender  5, 5, 5
PASS  future windows planned within limit      max 5 per sender per window
PASS  every moved row has a delayed job        1185/1185 delayed
PASS  order preserved (seq vs new time)        0 inversions
```

(This run used the earlier wording "All due jobs processed". The script now
prints "All jobs for this hour processed". The check is the same.)

What the numbers show:

- **Scheduling time:** 739 ms for 1200 leads. That covers validation, one
  database transaction (a batch row plus one multi-row insert) and one
  `addBulk` to Redis.
- **This hour:** exactly 15 sends, 3 senders × 5 each. The Redis counters
  stopped at the limit.
- **Overflow:** the other 1185 emails weren't failed or dropped. They moved to
  the next 79 hour windows, 15 per window (5 per sender), each still backed by
  a delayed BullMQ job.
- **Order:** within each sender, the new send times follow the original order
  (`seq`), with 0 inversions.
- **Time to first touch:** 29 s at `MIN_DELAY_MS=20`, because every job, even
  one that is only moved, takes one limiter slot. At the default
  `MIN_DELAY_MS=1000`, the first touch of 1200 due jobs takes about 20 minutes.
  The minimum gap applies to every job start, including moved ones.

## Test 2: hard restart in the middle of sending (exactly-once)

```
SMTP_DRY_RUN=true MIN_DELAY_MS=20 MAX_EMAILS_PER_HOUR_PER_SENDER=1000 \
  npm run loadtest -- --leads 600 --hourly-limit 1000 --delay-ms 50 --reset-counters --keep
```

The 600 emails were spaced 50 ms apart. About 10 s in, the API and the worker
were **hard-killed** (`Stop-Process -Force`, so no graceful shutdown), left
down for about 5 s, and then started again with the same settings.

| Moment | Result |
|---|---|
| At the kill (13:38:53 UTC) | 246 sent, 354 scheduled, **0 in `sending`** |
| Worker boot after restart | `[reconcile] checked 355 scheduled rows, re-queued 0 missing jobs, marked 0 stuck 'sending' rows as failed` (355 = 354 test rows + 1 unrelated pending email; 0 re-queued because the delayed jobs survived in Redis) |
| Worker logs | Run 1: 246 "sent" lines. Run 2: 354. **Total 600 lines, 600 unique addresses, 0 duplicates** |
| Database at the end | 600 × `sent`, max `attempts` = 1, 0 failed |

```
=== RESULT ===
PASS  schedule API handles N leads             600 rows in 664ms
PASS  every due job was processed              due remaining = 0
PASS  sent == free hourly capacity             sent 600, expected 600 (3 senders x limit 1000, minus 0/0/0 already used)
PASS  no job failed                            failed = 0
PASS  nothing lost (sent + moved == N)         600 + 0 = 600
PASS  no row sent more than once               max attempts on sent rows = 1
PASS  Redis counter <= limit for every sender  200, 200, 200
```

In this run no email happened to be mid-send at the moment of the kill. If
one had been, its row would have stayed in `sending`. BullMQ's stalled-job
check would then re-run the job, the atomic claim (`status='scheduled'` →
`'sending'`) would refuse it, and once `STUCK_SENDING_THRESHOLD_MS` passed,
reconcile would mark it `failed` rather than risk sending it twice. See
"Trade-offs" in the README.

## Test 3: jobs lost from Redis (recovery from Postgres)

1. Scheduled 50 emails for 2 hours later.
2. Deleted their 50 jobs from Redis. This is what a Redis wipe does to them;
   only these jobs were deleted, to leave other data alone.
3. Started the worker.

```
[reconcile] checked 51 scheduled rows, re-queued 50 missing jobs, marked 0 stuck 'sending' rows as failed
rows=50, delayed jobs now=50
```

Postgres is the source of truth. On boot, every `scheduled` row without a job
gets one again, with the remaining delay (`jobId = email.id`, so re-adding is
safe).
