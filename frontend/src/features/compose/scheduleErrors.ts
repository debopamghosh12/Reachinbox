import { ApiError } from "../../lib/api/client";

export type ComposeField = "recipients" | "subject" | "body" | "delay" | "hourly";
export type FieldErrors = Partial<Record<ComposeField, string>>;

// Backend field names -> form fields.
const API_FIELDS: Record<string, ComposeField> = {
  leads: "recipients",
  subject: "subject",
  body: "body",
  delayBetweenMs: "delay",
  hourlyLimit: "hourly",
};

// Turns a failed POST /api/emails/schedule into messages next to the right
// fields, plus one general message for anything that has no field.
export function scheduleErrorToFields(err: unknown): { fields: FieldErrors; general?: string } {
  if (!(err instanceof ApiError)) return { fields: {}, general: "Something went wrong. Please try again." };

  switch (err.code) {
    case "InvalidLeads": {
      const invalid = readInvalidList(err.details);
      return { fields: { recipients: invalid.length ? `${err.message}: ${invalid.slice(0, 5).join(", ")}` : err.message } };
    }
    case "TooManyLeads":
      return { fields: { recipients: err.message } };
    case "BodyTooLarge":
    case "EmptyBody":
      return { fields: { body: err.message } };
    case "ValidationError": {
      const fields: FieldErrors = {};
      const other: string[] = [];
      for (const issue of readIssues(err.details)) {
        const field = API_FIELDS[issue.path.split(".")[0]];
        if (field) fields[field] ??= issue.message;
        else other.push(`${issue.path || "request"}: ${issue.message}`);
      }
      return { fields, general: other.length ? other.join("; ") : undefined };
    }
    default:
      return { fields: {}, general: err.message };
  }
}

// `details` is `unknown` (it comes from the network), so check its shape.
function readInvalidList(details: unknown): string[] {
  if (typeof details === "object" && details !== null && "invalid" in details && Array.isArray(details.invalid)) {
    return details.invalid.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export function readIssues(details: unknown): { path: string; message: string }[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((d: unknown) =>
    typeof d === "object" && d !== null && "path" in d && "message" in d && typeof d.path === "string" && typeof d.message === "string"
      ? [{ path: d.path, message: d.message }]
      : [],
  );
}
