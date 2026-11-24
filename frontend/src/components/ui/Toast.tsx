import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type ToastTone = "success" | "error" | "info";
type ShowToast = (message: string, tone?: ToastTone) => void;

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_MS = 5000;
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

const ToastContext = createContext<ShowToast | null>(null);

// Wrap the app once; any component can then call useToast()("Saved", "success").
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ShowToast>(
    (message, tone = "info") => {
      const id = ++nextId.current;
      setToasts((all) => [...all, { id, message, tone }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext value={show}>
      {children}
      {/* aria-live: screen readers announce new toasts without moving focus */}
      <div aria-live="polite" className="fixed bottom-6 left-1/2 z-50 flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="flex items-start gap-2 rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-[0_4px_16px_rgba(16,24,40,0.12)]"
            >
              <Icon
                aria-hidden
                className={cn("mt-0.5 h-4 w-4 shrink-0", t.tone === "success" && "text-green-600", t.tone === "error" && "text-red-600", t.tone === "info" && "text-gray-500")}
              />
              <p className="flex-1 text-gray-900">{t.message}</p>
              <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-0.5 text-gray-400 hover:text-gray-900">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
