import { useId, useState, type RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { Popover } from "../../components/ui/Popover";
import { cn } from "../../lib/cn";
import { toDateTimeLocalValue } from "../../lib/format";

interface SendLaterPopoverProps {
  open: boolean;
  onClose: () => void;
  rootRef: RefObject<HTMLElement | null>;
  onConfirm: (when: Date) => void;
}

// Presets from the Figma, computed in the user's local time.
function presets(now: Date): { label: string; date: Date }[] {
  const tomorrowAt = (hours: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(hours, 0, 0, 0);
    return d;
  };
  const sameTimeTomorrow = new Date(now);
  sameTimeTomorrow.setDate(now.getDate() + 1);
  sameTimeTomorrow.setSeconds(0, 0);
  return [
    { label: "Tomorrow", date: sameTimeTomorrow },
    { label: "Tomorrow, 10:00 AM", date: tomorrowAt(10) },
    { label: "Tomorrow, 11:00 AM", date: tomorrowAt(11) },
    { label: "Tomorrow, 3:00 PM", date: tomorrowAt(15) },
  ];
}

export function SendLaterPopover({ open, onClose, rootRef, onConfirm }: SendLaterPopoverProps) {
  const [value, setValue] = useState(""); // "YYYY-MM-DDTHH:mm" in local time
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const now = new Date();

  function done() {
    if (!value) return setError("Pick a date and time");
    const when = new Date(value); // datetime-local strings are read as local time
    if (when.getTime() <= Date.now()) return setError("Pick a time in the future");
    setError(null);
    onConfirm(when);
  }

  return (
    <Popover open={open} onClose={onClose} rootRef={rootRef} label="Send later" className="w-80 p-4">
      <p className="mb-3 text-sm font-medium text-gray-900">Send Later</p>

      <label htmlFor={inputId} className="sr-only">Pick date &amp; time</label>
      <input
        id={inputId}
        type="datetime-local"
        value={value}
        min={toDateTimeLocalValue(now)}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className="h-9 w-full border-b border-line bg-transparent text-sm text-gray-600 focus:border-green-600 focus:outline-none"
      />
      {error && <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600">{error}</p>}

      <ul className="mt-3 flex flex-col">
        {presets(now).map((p) => {
          const selected = value === toDateTimeLocalValue(p.date);
          return (
            <li key={p.label}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setValue(toDateTimeLocalValue(p.date));
                  setError(null);
                }}
                className={cn(
                  "w-full rounded-md px-1 py-1.5 text-left text-sm hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-green-600",
                  selected ? "font-medium text-green-700" : "text-gray-600",
                )}
              >
                {p.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="outline" size="sm" onClick={done}>Done</Button>
      </div>
    </Popover>
  );
}
