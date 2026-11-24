// One typed function per backend endpoint the UI uses.
import type {
  EmailDetail,
  EmailListItem,
  ListTab,
  Me,
  Page,
  ScheduleRequest,
  ScheduleResponse,
  SlackStatus,
} from "../../types/api";
import { API_URL, api, isUnauthorized } from "./client";

// ---- auth ----
// Logged out is a normal answer, not an error: return null. That keeps it
// out of error handling and retries, so a 401 here can never start a refetch loop.
export async function getMe(): Promise<Me | null> {
  try {
    return await api<Me>("/api/me");
  } catch (err) {
    if (isUnauthorized(err)) return null;
    throw err;
  }
}
export const logout = () => api<void>("/auth/logout", { method: "POST" });
// Full-page navigations (OAuth needs the browser to leave our app), not fetch calls.
export const googleLoginUrl = `${API_URL}/auth/google`;
export const slackConnectUrl = `${API_URL}/auth/slack`;

// ---- emails ----
export interface ListParams {
  tab: ListTab;
  page: number;
  q: string; // empty = plain list, otherwise full-text search
}

export function listEmails({ tab, page, q }: ListParams) {
  const query = { status: tab, page, q: q || undefined };
  return api<Page<EmailListItem>>(q ? "/api/emails/search" : "/api/emails", { query });
}

// Sidebar counts: ask for one row and read `total`. The row comes along for
// free: for "scheduled" the API sorts by scheduledAt (soonest first), so it is
// the next email due, which is what list polling is timed on.
export interface EmailSummary {
  total: number;
  first: EmailListItem | null;
}

export async function getEmailSummary(tab: ListTab): Promise<EmailSummary> {
  const res = await api<Page<EmailListItem>>("/api/emails", { query: { status: tab, limit: 1 } });
  return { total: res.total, first: res.items[0] ?? null };
}

export const getEmail = (id: string) => api<EmailDetail>(`/api/emails/${encodeURIComponent(id)}`);

export const scheduleEmails = (body: ScheduleRequest) =>
  api<ScheduleResponse>("/api/emails/schedule", { method: "POST", body });

// ---- slack ----
export const getSlackStatus = () => api<SlackStatus>("/api/slack/status");
export const disconnectSlack = () => api<void>("/api/slack", { method: "DELETE" });
