"use client";

import { useSyncExternalStore } from "react";

/**
 * Timestamps that do not fight hydration.
 *
 * The audit log threw a React hydration error on every direct load, and the cause is the same one
 * that will bite any timestamp rendered with `Intl.DateTimeFormat` in a component that runs on both
 * sides: the server formats in the SERVER's timezone (UTC on Vercel) and the browser re-formats in
 * the reader's, so the two renders disagree about the text and React tears the tree down.
 *
 * The fix is not `suppressHydrationWarning` — that hides the warning and keeps the mismatch. It is
 * to render something the server and the first client pass agree on (an explicit-UTC string), then
 * swap to the reader's own timezone once mounted. The `<time>` element carries the machine-readable
 * value throughout, so a screen reader and a copy-paste both get the real instant either way.
 *
 * "Once mounted" is asked via `useSyncExternalStore` rather than the usual `useState(false)` plus a
 * mount effect. It is the same answer with none of the cost: React reads `getServerSnapshot` while
 * hydrating and `getSnapshot` afterwards, so there is no extra render pass and no setState firing
 * from inside an effect.
 */

/** A store that never changes: false while hydrating, true once the client owns the tree. */
const neverChanges = () => () => {};
const onClient = () => true;
const onServer = () => false;

function useHydrated(): boolean {
  return useSyncExternalStore(neverChanges, onClient, onServer);
}

function formatAbsolute(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelative(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const delta = then - Date.now();
  const abs = Math.abs(delta);

  // Below a minute both directions read the same, and "in 4 seconds" is noise.
  if (abs < MINUTE) return delta < 0 ? "just now" : "in a moment";

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < HOUR) return rtf.format(Math.round(delta / MINUTE), "minute");
  if (abs < DAY) return rtf.format(Math.round(delta / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(delta / DAY), "day");
  if (abs < 365 * DAY) return rtf.format(Math.round(delta / (30 * DAY)), "month");
  return rtf.format(Math.round(delta / (365 * DAY)), "year");
}

/** "3 days ago" / "in 12 days", with the exact instant on hover. Absolute UTC until mounted. */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useHydrated();

  return (
    <time dateTime={iso} title={formatAbsolute(iso)} className={className}>
      {hydrated ? formatRelative(iso) : `${formatAbsolute(iso, "UTC")} UTC`}
    </time>
  );
}

/** The full timestamp, in the reader's timezone once mounted and in UTC before that. */
export function AbsoluteTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useHydrated();

  return (
    <time dateTime={iso} className={className}>
      {hydrated ? formatAbsolute(iso) : `${formatAbsolute(iso, "UTC")} UTC`}
    </time>
  );
}
