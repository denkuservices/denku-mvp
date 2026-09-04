"use client";

import { useEffect, useState } from "react";
import { useOptionalDashboardLocale } from "@/components/dashboard-i18n/DashboardLocaleProvider";
import { slowLoadMessageAt, slowLoadNextChangeMs } from "./slowLoadCopy";

/**
 * What a page says when it is taking a while (2026-09-04).
 *
 * Every dashboard route renders a skeleton while its data is fetched, and for a fast page that is
 * the right answer — a skeleton that appears and disappears reads as the page arriving. A skeleton
 * that sits there for five seconds reads as a broken app: it never says whether anything is still
 * happening, so the reader starts clicking again.
 *
 * So this stays completely silent for the first two seconds and only then fades in a spinner with
 * a line of text that changes as the wait goes on. The schedule, and the reasoning behind it,
 * live in `slowLoadCopy.ts`; this file is only the rendering and the timers.
 *
 * The copy is written in English and localised through the dashboard dictionary, like the rest of
 * the authenticated product, so it appears in the reader's own language.
 */
export default function SlowLoadNotice() {
  const { translate } = useOptionalDashboardLocale();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // The clock starts when the boundary mounts, read inside the effect rather than during
    // render: a render is not allowed to depend on the time, and this one does not need to —
    // the first message is 2s away regardless.
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setMessage(slowLoadMessageAt(elapsed));

      // One render per message rather than a polling interval: this component is mounted during
      // the one moment the browser is already busy fetching a page.
      const next = slowLoadNextChangeMs(elapsed);
      if (next !== null) timer = setTimeout(tick, Math.max(next, 16));
    };

    tick();
    return () => clearTimeout(timer);
  }, []);

  if (!message) return null;

  return (
    <div
      // `polite`, so a screen reader finishes its sentence before announcing this. Only the text
      // is live — a spinner that announced itself every couple of seconds would be unusable.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
    >
      <div className="flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-gray-200 bg-white/95 px-4 py-2.5 shadow-lg backdrop-blur-sm dark:border-white/10 dark:bg-navy-800/95">
        <span
          aria-hidden="true"
          className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500 motion-reduce:animate-none dark:border-white/15 dark:border-t-brand-400"
        />
        <span className="truncate text-[13px] font-medium text-navy-700 dark:text-white">
          {translate(message)}
        </span>
      </div>
    </div>
  );
}
