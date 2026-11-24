// Dates are stored in UTC and shown in the browser's own time zone
// (Intl uses the system zone when none is given). The locale is fixed to
// en-US so the text matches the Figma ("Tue 9:15:12 AM") on every machine;
// other locales would give e.g. "Tue, 9:15:12 am".

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCALE = "en-US";

const weekdayTime = new Intl.DateTimeFormat(LOCALE, { weekday: "short", hour: "numeric", minute: "2-digit", second: "2-digit" });
const dateTime = new Intl.DateTimeFormat(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const full = new Intl.DateTimeFormat(LOCALE, { dateStyle: "full", timeStyle: "long" });

// List pill: "Tue 9:15:12 AM" like the Figma. A weekday alone is ambiguous
// more than 6 days away, so then: "Nov 30, 9:15 AM".
export function formatPillTime(iso: string, now = Date.now()): string {
  const date = new Date(iso);
  return Math.abs(date.getTime() - now) < 6 * DAY_MS ? weekdayTime.format(date) : dateTime.format(date);
}

// Detail page header: "Nov 3, 10:23 AM".
export function formatShortDate(iso: string): string {
  return dateTime.format(new Date(iso));
}

// <input type="datetime-local"> works in LOCAL time and wants "YYYY-MM-DDTHH:mm".
// (toISOString() would give UTC, i.e. the wrong hour on screen.)
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Tooltips: the complete date, time and zone.
export function formatFullDate(iso: string): string {
  return full.format(new Date(iso));
}
