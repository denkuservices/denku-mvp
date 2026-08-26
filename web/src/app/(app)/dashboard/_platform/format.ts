/** Presentational helpers shared across platform surfaces. */

export function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

/**
 * The same instant, in the width of an inbox row.
 *
 * A conversation row gives the timestamp a fixed slot at its right edge, beside the name — so
 * "2h ago" has to become "2h" or it pushes the name it is supposed to sit next to. Anything
 * older than a week falls back to a date, because "63d" is not something anyone reads as a day.
 */
export function formatShortWhen(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Clock time for a message bubble — the only timestamp inside a thread. */
export function formatClock(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function titleCase(s?: string | null): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function statusPillClass(status?: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (["completed", "connected", "active", "closed", "handled"].includes(s))
    return "bg-green-50 text-green-700 border border-green-200 dark:bg-green-500/10 dark:text-green-300";
  if (["open", "scheduled", "new"].includes(s))
    return "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-500/10 dark:text-blue-300";
  if (["coming_soon", "inactive", "disconnected"].includes(s))
    return "bg-gray-50 text-gray-600 border border-gray-200 dark:bg-white/5 dark:text-gray-400";
  return "bg-gray-50 text-gray-600 border border-gray-200 dark:bg-white/5 dark:text-gray-400";
}

/**
 * The language an employee answers in, in words a business owner uses.
 *
 * The roster used to print `{LANG} · {voice}` — literally "EN · alloy", exposing an OpenAI TTS
 * identifier on the page a customer opens to check on their AI. CLAUDE.md's rule is that model,
 * engine and voice names never reach an SMB surface (they belong in Settings → Advanced).
 *
 * Accepts both spellings the system stores: onboarding writes the ISO code, the Setup editor
 * writes the display name (the R-135 split). Unknown values fall back to English, which is what
 * `resolveLanguage` does for the actual voice — so the label never contradicts the behaviour.
 */
export function languageLabel(language?: string | null): string {
  const raw = (language ?? "").trim().toLowerCase();
  if (!raw) return "English";
  const base = raw.split(/[-_]/)[0];
  if (raw === "spanish" || raw === "español" || raw === "espanol" || base === "es") return "Spanish";
  return "English";
}
