"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

/**
 * Minimal, dependency-free toast system (R-062) — one feedback primitive for all
 * mutations. Accessible: the toast region is an `aria-live="polite"` landmark so
 * screen readers announce success/failure (also serves R-070/R-071's live-region gap).
 *
 * Usage: wrap a subtree in <ToastProvider>, then `const { toast } = useToast();`
 * and call `toast("Saved", "success")` / `toast(msg, "error")`.
 */

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 5000;

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: typeof Info; ring: string; iconColor: string }
> = {
  success: { icon: CheckCircle2, ring: "border-green-200 dark:border-green-500/30", iconColor: "text-green-500" },
  error: { icon: AlertCircle, ring: "border-red-200 dark:border-red-500/30", iconColor: "text-red-500" },
  info: { icon: Info, ring: "border-gray-200 dark:border-navy-600", iconColor: "text-brand-500" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => setMounted(true), []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const success = useCallback((m: string) => toast(m, "success"), [toast]);
  const error = useCallback((m: string) => toast(m, "error"), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error }}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="false"
            className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
          >
            {toasts.map((t) => {
              const { icon: Icon, ring, iconColor } = VARIANT_STYLES[t.variant];
              return (
                <div
                  key={t.id}
                  role={t.variant === "error" ? "alert" : "status"}
                  className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${ring} bg-white px-4 py-3 shadow-md dark:bg-navy-800`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconColor}`} />
                  <p className="flex-1 text-sm text-navy-700 dark:text-white">{t.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
