import React from "react";
import { User } from "lucide-react";

/**
 * Contact avatar — the anchor every list row was missing.
 *
 * Rows used to open with a channel badge and then two lines of grey text, so scanning a list meant
 * reading it. An avatar gives each row a fixed, recognisable starting point: you find the customer
 * you remember by shape and colour before you read a word.
 *
 * **We have no photos, and inventing one would be a lie.** So this is initials on a colour derived
 * from the contact's own identifier — stable, so the same person is the same colour on every
 * surface and across sessions, and meaningless as data, so it can never imply we know something we
 * don't. A contact with no name at all gets a neutral glyph rather than an initial squeezed out of
 * a phone number.
 */

/** Full class strings (never interpolated) so Tailwind can see them. */
const PALETTE = [
  "bg-teal-100 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
];

const NEUTRAL = "bg-gray-100 text-gray-400 dark:bg-white/10 dark:text-gray-400";

/** Stable, order-independent hash so a contact keeps its colour forever. */
function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/**
 * Up to two initials from a human name.
 *
 * Returns null for anything that isn't one — a phone number, an "@handle", "Unknown contact" —
 * because "+1" or "32" as an avatar reads as data and is not.
 */
export function initialsOf(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const words = n.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length === 0) return null;
  const letters = words
    .slice(0, 2)
    .map((w) => [...w].find((ch) => /\p{L}/u.test(ch)) ?? "")
    .join("");
  return letters ? letters.toUpperCase() : null;
}

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
} as const;

export default function Avatar({
  name,
  seed,
  size = "sm",
  className = "",
}: {
  /** Display name, when we have one. */
  name?: string | null;
  /** What the colour is derived from — an id or handle, so it survives a rename. */
  seed?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = initialsOf(name);
  const tone = initials ? paletteFor(seed || name || "") : NEUTRAL;

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZES[size]} ${tone} ${className}`}
    >
      {initials ?? <User className="h-1/2 w-1/2" />}
    </span>
  );
}
