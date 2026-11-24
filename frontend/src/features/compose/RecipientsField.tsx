import { Upload } from "lucide-react";
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { Chip } from "../../components/ui/Chip";
import { parseRecipients } from "../../lib/recipients";

const VISIBLE_CHIPS = 3; // like the Figma: three chips, then "+N"
const SEPARATOR_KEYS = new Set(["Enter", ",", ";", " ", "Tab"]);

interface RecipientsFieldProps {
  id: string;
  value: string[];
  onChange: (emails: string[]) => void;
  error?: string;
}

// The "To" row: chips for each address, a text box to type or paste more,
// and "Upload List" for a .csv/.txt file (parsed here in the browser).
export function RecipientsField({ id, value, onChange, error }: RecipientsFieldProps) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(false);
  // "info" = the upload/paste summary (neutral; `skipped` shown in muted amber),
  // "warn" = a problem with what was just typed.
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "warn"; skipped?: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Parses `text`, adds the valid new addresses, and returns what was skipped.
  function add(text: string) {
    const parsed = parseRecipients(text, value);
    if (parsed.emails.length) onChange([...value, ...parsed.emails]);
    return parsed;
  }

  // Typing: commit the draft when a separator key is pressed or the box loses focus.
  function commitDraft() {
    const text = draft.trim();
    if (!text) return;
    const { emails, invalid, duplicates } = add(text);
    if (invalid.length || (!emails.length && !duplicates)) {
      // Keep the bad text in the box so it can be fixed. (The second case is
      // a lone word like "email" that the parser treats as a CSV header.)
      setDraft(invalid.length ? invalid.join(" ") : text);
      setNotice({ text: `"${invalid[0] ?? text}" isn't a valid email address`, tone: "warn" });
    } else {
      setDraft("");
      setNotice(duplicates && !emails.length ? { text: "Already in the list", tone: "warn" } : null);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (SEPARATOR_KEYS.has(e.key) && draft.trim()) {
      if (e.key !== "Tab") e.preventDefault(); // Tab still moves focus after committing
      commitDraft();
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1)); // Backspace in an empty box removes the last chip
    }
  }

  // Pasting a whole list ("a@x.com, b@y.com\nc@z.com") adds all of it at once.
  function onPaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text");
    if (!/[\s,;]/.test(text.trim())) return; // a single address: let it paste normally
    e.preventDefault();
    report(add(text));
  }

  async function onFile(file: File) {
    report(add(await file.text()));
    if (fileRef.current) fileRef.current.value = ""; // allow picking the same file again
  }

  function report({ emails, invalid, duplicates }: ReturnType<typeof parseRecipients>) {
    const skipped = invalid.length + duplicates;
    setNotice({
      text: `${emails.length} email address${emails.length === 1 ? "" : "es"} detected`,
      tone: "info",
      skipped: skipped ? `${skipped} skipped (${duplicates} duplicate, ${invalid.length} invalid)` : undefined,
    });
  }

  const shown = expanded ? value : value.slice(0, VISIBLE_CHIPS);
  const hidden = value.length - shown.length;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-2">
          {shown.map((email) => (
            <Chip key={email} onRemove={() => onChange(value.filter((e) => e !== email))} removeLabel={`Remove ${email}`}>
              {email}
            </Chip>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Show ${hidden} more recipients`}
              className="inline-flex h-7 items-center rounded-full border border-green-500 bg-brand-50 px-2.5 text-xs font-medium text-gray-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-green-600"
            >
              +{hidden}
            </button>
          )}
          {expanded && value.length > VISIBLE_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500 underline hover:text-gray-900">
              Show less
            </button>
          )}
          <input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
            placeholder={value.length ? "" : "recipient@example.com"}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            className="h-7 min-w-[180px] flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded text-sm font-medium text-green-600 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-600"
        >
          <Upload className="h-4 w-4" aria-hidden />
          Upload List
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
      </div>
      <p id={`${id}-help`} aria-live="polite" className="text-xs">
        {error ? (
          <span className="text-red-600">{error}</span>
        ) : (
          notice &&
          (notice.tone === "warn" ? (
            <span className="text-orange-700">{notice.text}</span>
          ) : (
            <span className="text-gray-600">
              {notice.text}
              {notice.skipped && <span className="text-amber-600"> · {notice.skipped}</span>}
            </span>
          ))
        )}
      </p>
    </div>
  );
}
