import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Clock, Lock } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { BodyEditor } from "../features/compose/BodyEditor";
import { RecipientsField } from "../features/compose/RecipientsField";
import { SendLaterPopover } from "../features/compose/SendLaterPopover";
import { scheduleErrorToFields, type ComposeField, type FieldErrors } from "../features/compose/scheduleErrors";
import { scheduleEmails } from "../lib/api/endpoints";
import { cn } from "../lib/cn";
import { formatShortDate } from "../lib/format";
import { queryKeys } from "../lib/queryClient";
import type { ScheduleRequest } from "../types/api";

interface FormState {
  recipients: string[];
  subject: string;
  body: string; // editor HTML, "" when empty
  delaySeconds: string; // input values are strings; validated below
  hourlyLimit: string;
}

const EMPTY_FORM: FormState = { recipients: [], subject: "", body: "", delaySeconds: "", hourlyLimit: "" };

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const isWhole = (v: string) => /^\d+$/.test(v.trim());
  if (form.recipients.length === 0) errors.recipients = "Add at least one recipient";
  if (!form.subject.trim()) errors.subject = "Add a subject";
  if (!form.body) errors.body = "Write a message";
  if (!isWhole(form.delaySeconds)) errors.delay = "Enter whole seconds (0 or more)";
  if (!isWhole(form.hourlyLimit) || Number(form.hourlyLimit) < 1) errors.hourly = "Enter at least 1 email per hour";
  return errors;
}

export function ComposePage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const ids = { to: useId(), subject: useId(), delay: useId(), hourly: useId(), body: useId() };

  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const schedule = useMutation({
    mutationFn: (body: ScheduleRequest) => scheduleEmails(body),
    onSuccess: (res) => {
      const dupes = res.duplicatesRemoved ? `, ${res.duplicatesRemoved} duplicate${res.duplicatesRemoved === 1 ? "" : "s"} removed` : "";
      toast(`Scheduled ${res.count} email${res.count === 1 ? "" : "s"}${dupes}. First send: ${formatShortDate(res.firstSendAt)}`, "success");
      void queryClient.invalidateQueries({ queryKey: queryKeys.emails }); // list + counts
      navigate("/dashboard");
    },
    onError: (err) => {
      const { fields, general } = scheduleErrorToFields(err);
      setErrors(fields);
      setGeneralError(general ?? null);
      if (general) toast(general, "error");
    },
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K], field: ComposeField) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined })); // clear as the user fixes it
  };

  // Shared by "Send" (now) and the Send Later popover (chosen time).
  function submit(when: Date) {
    const found = validate(form);
    setErrors(found);
    setGeneralError(null);
    if (Object.keys(found).length) {
      setLaterOpen(false);
      toast("Please fix the highlighted fields", "error");
      return;
    }
    schedule.mutate({
      subject: form.subject.trim(),
      body: form.body,
      leads: form.recipients,
      startTime: when.toISOString(), // always UTC with a trailing "Z"
      delayBetweenMs: Number(form.delaySeconds) * 1000,
      hourlyLimit: Number(form.hourlyLimit),
    });
    setLaterOpen(false);
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="flex items-center gap-3 px-4 py-4">
        <Link to="/dashboard" aria-label="Back to Scheduled" className="rounded-full p-1.5 text-gray-900 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-green-600">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="flex-1 text-xl text-gray-900">Compose New Email</h1>

        <div ref={actionsRef} className="relative flex items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Pick a send time" aria-expanded={laterOpen} onClick={() => setLaterOpen((o) => !o)}>
            <Clock className="h-4 w-4" aria-hidden />
          </Button>
          <Button variant="outline" size="sm" aria-expanded={laterOpen} onClick={() => setLaterOpen((o) => !o)} disabled={schedule.isPending}>
            Send Later
          </Button>
          <Button variant="primary" size="sm" loading={schedule.isPending} onClick={() => submit(new Date())}>
            Send
          </Button>
          <SendLaterPopover open={laterOpen} onClose={() => setLaterOpen(false)} rootRef={actionsRef} onConfirm={submit} />
        </div>
      </header>

      <form className="mx-auto max-w-[1040px] px-6" onSubmit={(e) => e.preventDefault()} noValidate>
        {generalError && (
          <p role="alert" className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{generalError}</p>
        )}

        <Row label="From">
          {/* No senders endpoint: the backend rotates through its sender pool. */}
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#F5F5F5] px-3 text-sm text-gray-900" title="Emails are sent from the server's sender accounts in rotation" aria-readonly="true">
            Auto (rotating senders)
            <Lock className="h-3.5 w-3.5 text-gray-400" aria-hidden />
          </span>
        </Row>

        <Row label="To" htmlFor={ids.to} underline>
          <RecipientsField id={ids.to} value={form.recipients} onChange={(v) => update("recipients", v, "recipients")} error={errors.recipients} />
        </Row>

        <Row label="Subject" htmlFor={ids.subject} underline error={errors.subject} errorId={`${ids.subject}-error`}>
          <input
            id={ids.subject}
            value={form.subject}
            onChange={(e) => update("subject", e.target.value, "subject")}
            placeholder="Subject"
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={errors.subject ? `${ids.subject}-error` : undefined}
            className="h-10 w-full bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
        </Row>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-2 py-4">
          <NumberField id={ids.delay} label="Delay between 2 emails" unit="seconds" value={form.delaySeconds} error={errors.delay} onChange={(v) => update("delaySeconds", v, "delay")} />
          <NumberField id={ids.hourly} label="Hourly Limit" unit="emails / hour" value={form.hourlyLimit} error={errors.hourly} onChange={(v) => update("hourlyLimit", v, "hourly")} />
        </div>

        <BodyEditor id={ids.body} onChange={(html) => update("body", html, "body")} invalid={Boolean(errors.body)} describedBy={errors.body ? `${ids.body}-error` : undefined} />
        {errors.body && <p id={`${ids.body}-error`} className="mt-1 text-xs text-red-600">{errors.body}</p>}
      </form>
    </div>
  );
}

interface RowProps {
  label: string;
  htmlFor?: string;
  underline?: boolean;
  error?: string;
  errorId?: string;
  children: ReactNode;
}

// One "label: control" line of the form, with the Figma's hairline underneath.
function Row({ label, htmlFor, underline, error, errorId, children }: RowProps) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={cn("py-1", underline && "border-b border-line")}>
      <div className="flex min-h-12 items-center gap-4">
        <Label htmlFor={htmlFor} className="w-14 shrink-0 text-sm text-gray-900">{label}</Label>
        {children}
      </div>
      {error && <p id={errorId} className="pb-1 pl-[72px] text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface NumberFieldProps {
  id: string;
  label: string;
  unit: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}

function NumberField({ id, label, unit, value, error, onChange }: NumberFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="text-sm text-gray-900">{label}</label>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="00"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-unit${error ? ` ${id}-error` : ""}`}
          className={cn(
            "h-9 w-20 rounded-lg border bg-white px-2 text-center text-sm text-gray-900 placeholder:text-gray-300 focus:outline-2 focus:outline-green-600",
            error ? "border-red-400" : "border-line",
          )}
        />
        <span id={`${id}-unit`} className="text-xs text-gray-500">{unit}</span>
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
