import type { EmailListItem } from "../types/api";

const POLL_MS = 5_000; // fast checks while something is being sent or due soon
const SOON_MS = 2 * 60_000; // "due soon" = scheduled within the next 2 minutes
const MAX_WAIT_MS = 10 * 60_000; // never wait longer than this between checks

// When should the open list check the server next?
//  - nothing pending              -> never (false)
//  - sending, or due within 2 min -> every 5 s
//  - due later                    -> one check when it enters the 2-minute
//                                    window (at most 10 min away); that check
//                                    calls this again and switches to 5 s polling
// `next` is the earliest scheduled/sending email (see getEmailSummary).
export function pollDelay(next: EmailListItem | null, now = Date.now()): number | false {
  if (!next) return false;
  if (next.status === "sending") return POLL_MS;
  const dueIn = new Date(next.scheduledAt).getTime() - now;
  if (dueIn <= SOON_MS) return POLL_MS; // also covers overdue emails waiting for the worker
  return Math.min(dueIn - SOON_MS, MAX_WAIT_MS);
}
