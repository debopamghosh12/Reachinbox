// Shapes of the backend's JSON responses. Kept in one place so a backend
// change only needs one edit here. Dates arrive as ISO strings.

export type EmailStatus = "scheduled" | "sending" | "sent" | "failed";

// The two sidebar tabs. "scheduled" also returns rows in "sending".
export type ListTab = "scheduled" | "sent";

export interface AppConfig {
  smtpDryRun: boolean;
}

export interface Me {
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface EmailListItem {
  id: string;
  toEmail: string;
  subject: string;
  bodyPreview: string;
  senderEmail: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  previewUrl: string | null;
  // true = "sent" while the server ran with SMTP_DRY_RUN (no real delivery)
  simulated: boolean;
  error: string | null;
}

export interface EmailDetail extends EmailListItem {
  senderName: string;
  body: string;
  bodyFormat: "html" | "text";
}

export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  leads: string[];
  startTime: string; // ISO 8601 in UTC, e.g. 2026-11-25T04:30:00.000Z
  delayBetweenMs: number;
  hourlyLimit: number;
}

export interface ScheduleResponse {
  batchId: string;
  count: number;
  firstSendAt: string;
  lastSendAt: string;
  duplicatesRemoved: number;
}

export interface SlackStatus {
  connected: boolean;
  channel: string | null;
}

// Every backend error has this shape (see the backend's errorHandler).
export interface ApiErrorBody {
  error: string; // e.g. "ValidationError", "InvalidLeads", "Unauthorized"
  message: string;
  details?: unknown;
}
