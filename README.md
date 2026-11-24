# ONB Outbox: email job scheduler and dashboard

A full-stack email scheduler built for the ReachInbox (Outbox Labs) assignment.
A logged-in user writes one email, uploads a list of recipients and picks a
start time, the gap between emails and an hourly limit. The backend stores
every email and schedules it as a **BullMQ delayed job**; there is no cron.
Worker processes send through Ethereal SMTP while respecting per-sender
hourly limits. Every email is sent **at most once**, even across restarts,
crashes and retries.

- **Backend:** TypeScript, Express 5, BullMQ + Redis, Prisma + Postgres,
  Nodemailer (Ethereal), Elasticsearch, Slack OAuth, Google OAuth.
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, React Router,
  TanStack Query, TipTap editor.
- **Designs:** the Figma screenshots the UI was built from are in [`design/`](design/).
- **Demo video:** _link coming soon_
- **Load test results:** [`docs/load-test.md`](docs/load-test.md)

---

## Contents

1. [Features](#features)
2. [Running it locally](#running-it-locally)
3. [Configuration (env variables)](#configuration-env-variables)
4. [Architecture](#architecture)
5. [Behavior under load](#behavior-under-load)
6. [Assumptions, shortcuts and trade-offs](#assumptions-shortcuts-and-trade-offs)
7. [Project layout](#project-layout)

---

## Features

### Backend

| Area | What it does |
|---|---|
| **Scheduler** | `POST /api/emails/schedule` stores one batch plus one row per recipient in a single transaction, then adds one BullMQ **delayed job per email** (`jobId = email.id`). Email *i* is due at `startTime + i × delayBetweenMs`. Recipients are spread round-robin over the senders. No cron. |
| **Persistence** | Postgres is the source of truth. Redis runs with AOF (`appendonly yes`) and `noeviction`, so delayed jobs survive a Redis restart. On boot, both the API and the worker **reconcile**: any `scheduled` row without a job gets one again. |
| **Rate limiting** | Per sender, per clock hour, using an atomic Redis Lua counter shared by all workers. When a sender is full, the job is moved (`moveToDelayed`) to a later hour without failing it, and overflow is spread over the following hours in the original order. |
| **Concurrency** | `WORKER_CONCURRENCY` jobs at once per worker process, plus a queue-wide BullMQ limiter: at most 1 job starts per `MIN_DELAY_MS` across all workers. |
| **Idempotency** | Each send starts with an atomic claim (`UPDATE … SET status='sending' WHERE status='scheduled'`). Duplicate jobs, retries and re-queues can't send twice. Every email gets a deterministic `Message-ID`. |
| **Retries** | Transient SMTP failures retry up to `JOB_ATTEMPTS` times with exponential backoff, then the email becomes `failed` with the error stored. |
| **Slack alerts** | Users connect Slack (OAuth, incoming webhook). When a sender hits the hourly limit for their emails, they get one message per sender per hour. It never blocks sending. |
| **Search** | Elasticsearch full-text search over recipient, subject and body. Writes are versioned, so an older status can't overwrite a newer one. `npm run reindex` rebuilds the index from Postgres. If ES is down, sending still works. |
| **bull-board** | Queue dashboard at `/admin/queues`, for logged-in users listed in `ADMIN_EMAILS` only. |
| **Google auth** | Google OAuth login with a signed `state` checked against a cookie (CSRF), and an httpOnly session cookie (signed JWT). Every `/api/*` route requires login, and every query is scoped to the logged-in user. |
| **HTML bodies** | The editor's HTML is sanitized on the server (allowlist) and sent as HTML plus a plain-text fallback. Body size is capped by `MAX_BODY_BYTES`. |

### Frontend

| Screen / feature | What it does |
|---|---|
| **Login** | "Login with Google". The email/password form is shown disabled with a note (not implemented). Clear messages for OAuth errors (`?error=…`). |
| **Dashboard** | Sidebar with the ONB logo, a user card (Slack connect/disconnect, Log out), Compose, and **Scheduled** / **Sent** tabs with live counts. |
| **Tables** | Scheduled (scheduled + sending) and Sent (sent + failed) lists: recipient, time or status pill (failed ones show the error on hover), subject + preview, Ethereal preview link, Gmail-style pagination. |
| **Search** | Debounced (300 ms) full-text search within the open tab. |
| **Compose** | Recipient chips (type, paste or **upload a CSV/TXT**; header rows, quotes, extra columns, duplicates and invalid addresses are handled and reported), subject, delay in seconds, hourly limit, rich-text editor (TipTap), **Send** now or **Send Later** (date-time picker with presets). Server errors are shown next to the right field. |
| **Detail page** | Sender, recipient, date, status, failure reason, and the body (sanitized again with DOMPurify before display). |
| **Slack connect** | Connect or disconnect from the user menu. A toast confirms the result after the OAuth round trip. |
| **States** | Skeleton loaders, empty states (per tab and for searches), error states with Retry, toasts. |
| **Polling** | Lists and counts refresh on their own when a send is near (details under [Polling](#polling-frontend)). |
| **Session handling** | A 401 anywhere means "logged out": one redirect to `/login`, no retry loop. |

---

## Running it locally

### Prerequisites

- **Node.js 20.19+ or 22.12+** (what Vite 8 requires) and npm. Tested on Node 22.14.
- **Docker** with Docker Compose.
- Internet access (Ethereal, Google, and Slack if you use it).
- About 2 GB of free RAM for the containers. Elasticsearch alone takes about 1 GB.
- Optional: **ngrok** (or any HTTPS tunnel) for Slack OAuth.

### 1. Start Postgres, Redis and Elasticsearch

```bash
docker compose up -d
docker compose ps        # wait until all three are "healthy" (ES takes ~30-60 s)
```

> **Postgres is on host port 5433, not 5432.** A Postgres installed directly
> on the machine often owns 5432 and would silently answer instead of the
> container. Redis is on 6379, Elasticsearch on 9200.

### 2. Configure the backend

```bash
cd backend
cp .env.example .env
npm install
```

Fill in at least these values in `backend/.env`. Everything else already has
working values:

| Key | How to get it |
|---|---|
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | See [Google OAuth](#google-oauth-required) below |
| `ADMIN_EMAILS` | Your Google email, if you want to open bull-board |
| `SLACK_*`, `PUBLIC_BASE_URL` | Optional. See [Slack app](#slack-app-optional) below |

### 3. Create the tables and the senders

```bash
npx prisma migrate deploy   # creates the tables (and generates the Prisma client)
npm run db:seed             # creates SEED_SENDER_COUNT (default 3) Ethereal sender accounts
```

**Ethereal** is a fake SMTP service. Messages sent through it are captured,
never delivered. The seed script creates one Ethereal account per sender
through Nodemailer's API, so no signup is needed. It prints each account's
login. Every sent email also gets a **Preview** link in the UI that opens the
captured message. The seed is safe to re-run; it only creates missing senders.

### 4. Start the API and the worker

```bash
npm run dev:all      # API on http://localhost:4000 + one worker process
```

Or start them in two terminals with `npm run dev` and `npm run dev:worker`.
You can start more workers; correctness doesn't depend on there being only one.

### 5. Start the frontend

```bash
cd ../frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

Open <http://localhost:5173> and log in with Google.

### Google OAuth (required)

1. In [Google Cloud Console](https://console.cloud.google.com/), create or
   choose a project.
2. Go to **APIs & Services → OAuth consent screen**. Choose *External*, fill in
   the app name and your email, and keep the default scopes (the app asks only
   for `openid email profile`).
3. While the app is in **Testing** mode, add every Google account that will log
   in under **Test users**.
4. Go to **APIs & Services → Credentials → Create credentials → OAuth client
   ID**, with type *Web application*.
   - **Authorized redirect URIs:** `http://localhost:4000/auth/google/callback`.
     This must equal `GOOGLE_CALLBACK_URL` exactly.
   - No JavaScript origins are needed, because the code exchange happens on
     the server.
5. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Slack app (optional)

Slack only redirects to **HTTPS**, so the API needs a public HTTPS URL during
local development:

1. Run `ngrok http 4000` and copy the `https://….ngrok-free.app` URL into
   `PUBLIC_BASE_URL` (no trailing slash). The free plan gives you a new URL on
   each start, so update `.env` and the Slack redirect URL when it changes.
2. Create a Slack app at <https://api.slack.com/apps>, either **From scratch**
   or from this manifest (replace the domain):

   ```yaml
   display_information:
     name: Outbox Scheduler Alerts
   oauth_config:
     redirect_urls:
       - https://YOUR-NGROK-DOMAIN/auth/slack/callback
     scopes:
       bot:
         - incoming-webhook
   settings:
     org_deploy_enabled: false
     socket_mode_enabled: false
     token_rotation_enabled: false
   ```

   If you create it from scratch: under **OAuth & Permissions**, add the
   redirect URL `PUBLIC_BASE_URL/auth/slack/callback` and the scope
   `incoming-webhook`.
3. Under **Basic Information**, copy the client ID and secret into
   `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`, then restart the API.
4. In the app, open the user card → **Connect Slack** and pick a channel. If
   ngrok shows its "You are about to visit" page, click **Visit Site**.

Without Slack credentials the app runs normally: `/auth/slack` answers 503 and
alerts are skipped.

### bull-board

Put your Google email in `ADMIN_EMAILS` (comma-separated for several), restart
the API, log in through the frontend, then open
<http://localhost:4000/admin/queues>. Logged-in users who aren't listed get 403.

### Other commands

| Command (in `backend/`) | What it does |
|---|---|
| `npm run loadtest -- --leads 1200 --hourly-limit 5` | Load test; see [`docs/load-test.md`](docs/load-test.md). Run the API and worker with `SMTP_DRY_RUN=true` first. |
| `npm run reindex` | Rebuilds the Elasticsearch index from Postgres. |
| `npm run typecheck` / `npm run build` | Type-check / compile to `dist/`. |
| `npm start` / `npm run start:worker` | Run the compiled API / worker. |

---

## Configuration (env variables)

Every variable is listed with a placeholder and a comment in
[`backend/.env.example`](backend/.env.example) and
[`frontend/.env.example`](frontend/.env.example). The backend validates all
of them at startup (zod) and exits with a clear message if one is missing or
malformed. **Every limit is read from the environment; none is hardcoded.**

| Variable | Default in `.env.example` | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | `production` makes cookies `Secure` |
| `PORT` | `4000` | API port |
| `FRONTEND_URL` | `http://localhost:5173` | Allowed CORS origin; where OAuth redirects back to |
| `JSON_BODY_LIMIT` | `2mb` | Max request body (bounds the leads array) |
| `DATABASE_URL` | `…@localhost:5433/outbox` | Postgres (note the port) |
| `REDIS_URL` | `redis://localhost:6379` | Redis for BullMQ, rate counters and Slack dedupe |
| `ELASTICSEARCH_URL`, `ELASTICSEARCH_INDEX` | `http://localhost:9200`, `emails` | Search |
| `ES_REQUEST_TIMEOUT_MS` | `3000` | Short timeout, so a slow ES never holds anything up |
| `ES_BULK_BATCH_SIZE` | `1000` | Documents per bulk request (reindex) |
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker process |
| `MIN_DELAY_MS` | `1000` | Minimum gap between any two job starts, queue-wide (0 disables it) |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hard cap per sender per hour; a request's `hourlyLimit` can only lower it |
| `JOB_ATTEMPTS`, `JOB_BACKOFF_MS` | `3`, `5000` | SMTP retries with exponential backoff (5 s, 10 s, …) |
| `JOB_RETENTION_HOURS` | `168` | How long finished jobs stay in Redis / bull-board |
| `STUCK_SENDING_THRESHOLD_MS` | `900000` | A row in `sending` for longer than this (15 min) is marked `failed` on boot |
| `MAX_LEADS_PER_REQUEST` | `5000` | Max recipients per schedule request |
| `MAX_BODY_BYTES` | `102400` | Max email body size (100 KB) |
| `RESCHEDULE_SEQ_OFFSET_MS` | `10` | Spacing that keeps order when jobs move to a later hour |
| `RECONCILE_BATCH_SIZE` | `500` | Rows checked per round trip by reconcile |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | How long the worker waits for in-flight sends on shutdown |
| `SMTP_DRY_RUN` | `false` | `true` skips the real SMTP call (load tests only) |
| `PAGE_SIZE_DEFAULT`, `PAGE_SIZE_MAX` | `20`, `100` | List pagination |
| `SEED_SENDER_COUNT` | `3` | Senders created by `npm run db:seed` |
| `JWT_SECRET` | placeholder | Signs session cookies and OAuth states (32+ chars) |
| `SESSION_TTL_MS` | `604800000` | Login lifetime (7 days) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client (required) |
| `GOOGLE_CALLBACK_URL` | `http://localhost:4000/auth/google/callback` | Must match the redirect URI in Google Cloud |
| `GOOGLE_STATE_TTL_MS`, `GOOGLE_HTTP_TIMEOUT_MS` | `600000`, `5000` | Login link lifetime; timeout for calls to Google |
| `ADMIN_EMAILS` | empty | Who may open bull-board (empty = nobody) |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | empty | Slack app (optional) |
| `PUBLIC_BASE_URL` | empty | Public HTTPS URL of the API (ngrok), used for the Slack callback |
| `SLACK_STATE_TTL_MS`, `SLACK_HTTP_TIMEOUT_MS` | `600000`, `5000` | Connect-link lifetime; timeout for calls to Slack |
| `VITE_API_URL` (frontend) | `http://localhost:4000` | Where the frontend sends API calls |

---

## Architecture

```mermaid
flowchart LR
  UI["React app :5173"] -- "fetch, cookie" --> API["Express API :4000"]
  API -- "1 transaction: batch + email rows" --> PG[(Postgres :5433)]
  API -- "addBulk: delayed jobs, jobId = email.id" --> RQ[(Redis :6379<br/>AOF, noeviction)]
  API -- "search" --> ES[(Elasticsearch :9200)]
  RQ -- "job due" --> W["Worker process(es)"]
  W -- "atomic claim, status updates" --> PG
  W -- "Lua rate counter, moveToDelayed" --> RQ
  W -- "SMTP" --> ETH["Ethereal"]
  W -. "status sync, background" .-> ES
  W -. "rate-limit alert, background" .-> SL["Slack webhook"]
  API -- "OAuth" --> G["Google / Slack OAuth"]
  BB["bull-board /admin/queues"] --- API
```

The API and the worker are **separate processes** that share only Postgres and
Redis. You can run any number of workers.

### How scheduling works

1. `POST /api/emails/schedule` validates the input: addresses are lowercased
   and deduplicated, the body is sanitized and size-checked, and the start time
   must be ISO-8601. A start time in the past means "now".
2. In **one transaction** it inserts the batch row (subject, body, settings)
   and one `emails` row per recipient (multi-row insert). Each row has its
   `scheduledAt`, its sender (round-robin) and its position `seq`. The ids are
   generated in the app, so every email id is known before the insert.
3. **After** the commit, one `addBulk` creates a BullMQ delayed job per email
   with `jobId = email.id` and `delay = scheduledAt - now`. The job carries
   only the email id; the content always comes from Postgres.
4. If Redis fails between steps 2 and 3, the rows exist without jobs, and the
   next reconcile adds the jobs.

### Persistence across restarts

- **Delayed jobs live in Redis**, which runs with `appendonly yes` (every
  write logged to disk) and `maxmemory-policy noeviction` (BullMQ requires it;
  eviction could silently drop jobs). Restarting the API, the worker or Redis
  keeps every job.
- **Reconcile on boot** (API and worker): it pages through `scheduled` rows
  and re-adds any missing job with the remaining delay. Overdue ones run right
  away. Because `jobId = email.id`, re-adding an existing job is a no-op, so
  reconcile is safe to run any number of times from any number of processes.
- **Losing Redis data entirely** therefore loses no emails: Postgres still has
  every row, and reconcile rebuilds the jobs. (That hour's rate counters are
  lost too; see trade-offs.)
- **Graceful shutdown:** on SIGINT/SIGTERM the worker stops taking jobs and
  waits up to `SHUTDOWN_TIMEOUT_MS` for in-flight sends.

### Rate limiting

- **Counter:** `rl:{senderId}:{YYYYMMDDHH}` in Redis, incremented by a **Lua
  script**. Redis runs a script atomically, so two workers can never both take
  the last slot. Going over the limit undoes the increment, so the counter
  always equals real sends. Keys expire shortly after their hour ends.
- **Limit used:** `min(MAX_EMAILS_PER_HOUR_PER_SENDER, batch.hourlyLimit)`.
- **When the sender is full:** the row goes back to `scheduled` with a new
  `scheduledAt`, and the job is moved with `job.moveToDelayed(…)` plus
  `DelayedError`. It isn't counted as a failure and doesn't use a retry.
- **Spreading overflow:** a second counter, `ov:{senderId}:{hour}`, numbers the
  rejected jobs. Overflow *n* goes to hour `+ 1 + floor((n-1)/limit)`, so with
  limit 5 the first 5 overflows go to the next hour, the next 5 to the hour
  after, and so on. Without this, 1000 jobs would all wake up every hour just to
  be moved again. When a moved job wakes up, it still goes through the counter,
  so the placement is only a hint.
- **Order:** inside its new hour, a job runs at
  `hourStart + seq × RESCHEDULE_SEQ_OFFSET_MS`, so the original order is kept.

### Concurrency and the minimum delay

- `WORKER_CONCURRENCY` (5) jobs run in parallel per worker process.
- The BullMQ limiter `{ max: 1, duration: MIN_DELAY_MS }` stores its state in
  Redis, so the gap applies **across all workers**. The value chosen is
  **`MIN_DELAY_MS=1000`: at most one send starts per second**, queue-wide. Why:
  - It keeps the SMTP traffic polite. Real providers throttle or block bursts,
    and Ethereal is a shared free service.
  - It makes the per-request `delayBetweenMs` meaningful at small values.
  - 3600 starts per hour is far above what the hourly limits allow, so it
    never becomes the bottleneck for real sends.
- The cost: every job start, including one that is only moved by the rate
  limiter, takes a slot. The first pass over a large batch that is due at once
  is therefore paced (about 20 minutes for 1200 due jobs).

### Idempotency (never send twice)

1. **Atomic claim.** A worker first runs
   `UPDATE emails SET status='sending', attempts=attempts+1 WHERE id=$1 AND status='scheduled'`.
   Postgres row locking lets only one caller win. A duplicate job, a
   re-queued job or a second worker finds 0 rows changed and skips.
2. **Retries.** Only a failed SMTP call puts the row back to `scheduled` (or
   `failed` on the last attempt). If the SMTP call succeeded but the database
   update afterwards fails, the row isn't reset, so a retry can't resend it.
3. **Deterministic `Message-ID`:** `<emailId@sender-domain>`. Even if the same
   email were delivered twice, receiving servers could recognize the duplicate.
4. **Stuck `sending` rows.** If a worker dies mid-send, nobody can know whether
   SMTP accepted the message. On boot, rows that have been in `sending` for
   longer than `STUCK_SENDING_THRESHOLD_MS` are marked **`failed`** with a
   clear reason, not resent. This chooses at-most-once over a possible duplicate.

### Slack notifications

- **OAuth v2** with the `incoming-webhook` scope. The user picks a channel, and
  the webhook URL is stored per user. The OAuth `state` is a signed,
  short-lived token bound to the user.
- **Live lookup:** when a rate-limit hit happens, the worker looks up the
  email owner's connection at that moment. Connecting or disconnecting takes
  effect immediately, with no restart.
- **Dedupe:** a Redis `SET NX` key per sender per hour, so a burst of hundreds
  of moved jobs produces **one** message. The message names the sender, the
  limit, the hour (UTC) and how many of the user's emails moved.
- **Non-blocking:** the call isn't awaited and has a timeout, and any error is
  only logged. A slow or broken Slack never delays sending.
- **Disconnect** deletes the stored webhook and also revokes the token on
  Slack's side (best effort).

### Elasticsearch

- An explicit strict mapping (`to`, `subject`, `body`, `status`, dates; plus
  `userId` for scoping).
- **Versioned writes:** each document's version is the row's `updatedAt`
  (`version_type: external`). If writes arrive out of order, the older one is
  rejected (409, ignored), so an old `scheduled` can't overwrite `sent`.
- **Non-blocking:** indexing runs in the background with a short timeout. If
  ES is down, scheduling and sending carry on, a warning is logged (at most one
  line per 10 s), and search returns a clear 503.
- **Recovery:** `npm run reindex` rebuilds the index from Postgres.
- The body is indexed as **plain text** (tags removed), so searching
  `strong` doesn't match every bold email.

### HTML email bodies

- The editor (TipTap) produces HTML. On the server, **sanitize-html** keeps
  only an allowlist: paragraphs, headings, bold, italic, underline, strike,
  lists, quotes, links (`http`, `https`, `mailto`) and `text-align`. Scripts,
  event handlers, `javascript:` links, images and iframes are removed before
  storing. A body with no readable text left is rejected.
- The mailer sends **multipart/alternative**: the HTML part plus a plain-text
  fallback generated from it. Older plain-text bodies are sent as text only.
- The detail page runs **DOMPurify** again before displaying the body.
- List previews and the search index use the same HTML-to-text helper, so
  they never contain tags.

### Polling (frontend)

The open list refreshes on its own only when something is about to change:

- **Every 5 s** while the next pending email is `sending`, overdue, or due
  within 2 minutes.
- Otherwise, **one check when the next email enters that 2-minute window**,
  at most 10 minutes away. That check decides again.
- **No polling** when nothing is scheduled. Polling also pauses while the
  browser tab is in the background.

The "next email" comes from the request the sidebar count already makes
(`limit=1`, sorted by `scheduledAt`), so polling adds no extra endpoint. Every
list refresh also refreshes both counts.

---

## Behavior under load

Measured with `npm run loadtest` (full output in
[`docs/load-test.md`](docs/load-test.md)). The runs used dry-run SMTP,
`MIN_DELAY_MS=20` and 3 senders.

| Test | Result |
|---|---|
| **1200 emails**, hourly limit 5 | Scheduled in **739 ms** (one HTTP request). **15** sent this hour (3 senders × 5). The other **1185** moved, spread over **79 future hours, 15 per hour** (5 per sender), each still a delayed job. **0 lost, 0 duplicates, 0 order inversions.** Redis counters stopped at 5/5/5. |
| **Hard restart mid-run**: 600 emails, API + worker killed with `Stop-Process -Force` after 246 sends, restarted 5 s later | The new worker sent the remaining **354**. Logs: **600 sends for 600 unique addresses, 0 duplicates**. Every row `sent` with `attempts = 1`. |
| **Jobs lost from Redis**: 50 future emails, their jobs deleted | On boot, reconcile **re-queued all 50** from Postgres. |

At the default `MIN_DELAY_MS=1000`, a batch of 1200 emails due at once takes
about 20 minutes for its first pass (one job start per second). With the
hourly limit doing its job, each later hour then only wakes the jobs planned
for it.

---

## Assumptions, shortcuts and trade-offs

**Scheduling and rate limiting**

- **Fixed clock-hour windows (UTC).** The limit is per calendar hour, not a
  rolling 60 minutes. A sender can send `limit` emails at 10:59 and another
  `limit` at 11:00, so up to **2× the limit within a short span around an hour
  boundary**. A sliding window would cost more Redis work per send.
- **A Redis wipe resets that hour's counters**, so the limit can be exceeded
  in that hour. No emails are lost, since they're rebuilt from Postgres.
- **A failed SMTP attempt still uses its hourly slot.** We can't be sure the
  server didn't count it.
- **Stuck `sending` rows become `failed`, not resent.** If a worker crashes
  after SMTP accepted a message but before the database update, the email was
  actually sent but shows as failed. If it crashed before SMTP, the email
  wasn't sent and shows as failed with a "check and resend" message. Both are
  preferred to a possible duplicate.
- **Senders are a shared pool.** All users' emails rotate over the same seeded
  senders, and the hourly limit is per sender, so one user's large batch can
  fill a sender's hour for everyone.
- **The minimum delay is queue-wide**, and moved jobs also take a limiter slot
  (see [Concurrency](#concurrency-and-the-minimum-delay)).
- **Correctness doesn't depend on a single worker** (atomic claim, Lua counter,
  limiter in Redis), but the tests in this repo ran one worker process.

**Slack**

- **Dedupe is per sender per hour, not per user.** If two users' emails share
  a full sender in the same hour, only the first one to hit the limit gets the
  message.
- **The webhook URL is stored in plaintext** in Postgres. In production it
  should be encrypted at rest.
- `PUBLIC_BASE_URL` changes with every free ngrok session, and the Slack app's
  redirect URL has to be updated with it.

**Auth**

- **Google login only.** The email/password form is shown disabled, with a
  note.
- **Logout clears the cookie but doesn't revoke the token.** A copied cookie
  stays valid until it expires (`SESSION_TTL_MS`, 7 days). A server-side
  session table or a token denylist would fix this.
- Google may return a generated letter avatar for accounts without a profile
  photo; the UI shows whatever image Google provides.

**Frontend**

- **Polling, not push.** The UI polls on a schedule tied to the next due
  email. A WebSocket or SSE stream would be instant but adds infrastructure.
- **Send now and Send Later** are separate buttons (the Figma has one). The
  "Tomorrow" preset means the same time tomorrow. Times are entered in the
  browser's local time zone and sent as UTC ISO strings.
- **CSV parsing** happens in the browser. On a line that contains an email
  address, other cells are treated as extra columns and ignored. A line with
  no address counts as one invalid entry.
- **Not built:** attachments, star, filter, archive and trash (visible in the
  Figma, out of scope).

**Other**

- HTML detection uses a simple heuristic: a body containing a tag is HTML.
  Plain-text bodies that happen to contain `<b>` are treated as HTML.
- The body is stored once per batch. Every email in a batch has the same
  subject and body; there is no per-recipient personalization.
- Ethereal never delivers mail; it only captures it. Real delivery would
  need real SMTP credentials on the sender rows.

---

## Project layout

```
backend/
  prisma/              schema, migration, seed (Ethereal senders)
  scripts/             loadtest.ts, reindex.ts
  src/
    config/            env (zod-validated), prisma, redis, elasticsearch
    middleware/        requireAuth / requireAdmin, error handler, request log
    queue/             emailQueue (BullMQ), worker, rateLimiter (Lua), reconcile
    routes/            auth, emails, slack
    schemas/           request validation (zod)
    services/          schedule, sendEmail, mailer, search, slack, notifications, auth
    utils/             tokens (JWT), html (sanitize, html->text), logger, AppError
frontend/src/
  components/ui/       Button, Input, Chip, Popover, Toast, Spinner, Skeleton, ...
  features/            auth, emails, compose, layout, slack
  lib/                 api client + endpoints, query client, polling, recipients parser, formatting
  pages/               Login, EmailList, Compose, EmailDetail, NotFound
design/                Figma screenshots
docs/load-test.md      load test output
```
