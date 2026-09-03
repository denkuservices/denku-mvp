import * as React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  info: {
    box: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    Icon: Info,
  },
  success: {
    box: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    Icon: TriangleAlert,
  },
  danger: {
    box: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    Icon: AlertCircle,
  },
} as const;

/**
 * The danger box as a class string, for the plain `<div>`s that predate this component.
 *
 * Same tone map the component uses. Three channel cards each carried their own
 * `rounded-xl border border-red-200 bg-red-50 …` for the same "something went wrong" box; this is
 * the one they now share. New code should use `<Notice tone="danger">`, which also carries the
 * icon and the `role="alert"` a screen reader needs.
 */
export const DANGER_NOTICE_CLASS = cn(
  "rounded-xl border px-4 py-3 text-sm leading-6",
  tones.danger.box
);

export function Notice({
  children,
  tone = "info",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof tones;
  className?: string;
}) {
  const { box, Icon } = tones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-6", box, className)}>
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

