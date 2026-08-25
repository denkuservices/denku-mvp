import React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import Card from "@/components/ui-horizon/card";

/**
 * Platform UI primitives (Sprint 8.5 / R-127, audit Y-002/Y-008/Y-009).
 *
 * **Why this file exists:** the platform surfaces (Conversations, Contacts, Employees, Channels)
 * were hand-rolled in Tailwind while the pages that survive alongside them (Tickets, Appointments,
 * Settings) use Horizon components — two visual languages inside one product, and a genuine blocker
 * to enabling the platform UX.
 *
 * These primitives **wrap the real Horizon `Card`**, so consistency is structural rather than
 * approximated by copying class strings. Every platform surface renders through them; changing the
 * look once changes it everywhere.
 */

/** A panel. Same component the rest of the dashboard uses. */
export function Surface({
  children,
  className = "",
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <Card extra={`${padded ? "p-5" : ""} ${className}`}>{children}</Card>;
}

/** Section label above a group of surfaces. */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
      {action}
    </div>
  );
}

/** A single headline number. `note` must stay truthful (R-018) — say "recent N" when bounded. */
export function StatCard({
  label,
  value,
  note,
  href,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  href?: string;
}) {
  const body = (
    <Surface className="transition hover:shadow-xl">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-navy-700 dark:text-white">{value}</p>
      {note ? <p className="mt-1 text-xs text-gray-400">{note}</p> : null}
    </Surface>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * Empty state as **onboarding**, not a dead end (Y-007). A first-time customer sees only these, so
 * each one must say what the surface is, why it's empty, and offer exactly one next step.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon ? (
        <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 dark:bg-white/10">
          <Icon className="h-5 w-5 text-gray-400" />
        </span>
      ) : null}
      <p className="text-sm font-semibold text-navy-700 dark:text-white">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

/** Consistent status pill. */
export function Pill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "critical" | "info";
  className?: string;
}) {
  const tones: Record<string, string> = {
    ok: "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/20",
    warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
    critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/20",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",
    neutral: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Row list inside a Surface — one consistent list treatment across every surface. */
export function ListRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-5 py-3 transition hover:bg-gray-50 dark:hover:bg-white/5"
      >
        {children}
      </Link>
    </li>
  );
}

export function ListContainer({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-gray-100 dark:divide-white/10">{children}</ul>;
}

/** Header row inside a list Surface (count / filters live here). */
export function ListHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-white/10">
      {children}
    </div>
  );
}

/**
 * The one form-control recipe for platform surfaces (Sprint 9 · T7/T9).
 *
 * Height, border, background, and focus treatment live here so a select on one surface can't
 * drift from a select on another — and so the search field's left padding can never drift from
 * the position of the icon overlaid on it, which is exactly how icon/placeholder collisions
 * happen. Exported for the plain `<select>`/`<input>` elements that sit beside a SearchField.
 */
/**
 * Control chrome WITHOUT horizontal padding.
 *
 * Split out because `CONTROL_CLASS` used to carry `px-3`, and `SearchField` tried to override it
 * with `pl-9` to clear the magnifier. In Tailwind v4 those are different properties — `px-*` is
 * the `padding-inline` shorthand, `pl-*` is `padding-inline-start` — so which one wins depends on
 * their order in the generated stylesheet, not on the order they appear in the class attribute.
 * When the shorthand won, the placeholder rendered underneath the icon. Padding is now composed
 * per control instead of overridden, so the collision cannot come back.
 */
const CONTROL_BASE =
  "h-10 rounded-lg border border-gray-200 bg-white text-sm text-navy-700 outline-none transition " +
  "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 " +
  "dark:border-white/10 dark:bg-navy-800 dark:text-white";

export const CONTROL_CLASS = `${CONTROL_BASE} px-3`;

/**
 * Search input with its magnifier.
 *
 * The icon is absolutely positioned at `left-3` and is 16px wide, so the text must start at
 * 36px — `pl-9`. That pairing is the whole point of this component: the two values were
 * previously repeated on three pages, where either could be edited without the other.
 *
 * Uses `type="search"` so browsers keep their native clear affordance, and `pr-9` so that
 * affordance never sits on top of the value.
 */
export function SearchField({
  name = "q",
  defaultValue,
  placeholder,
  label,
  className = "",
}: {
  name?: string;
  defaultValue?: string;
  placeholder: string;
  /** Accessible name — the field has no visible <label>. */
  label: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />
      {/*
        Padding is inline, not a utility, and that is deliberate.

        `public/horizon/horizon.bundle.css` is a compiled Tailwind v3 bundle injected UNLAYERED by
        `HorizonStylesheet.tsx`. It carries a full preflight including
        `button,input,optgroup,select,textarea { margin:0; padding:0 }`. Unlayered declarations beat
        layered ones regardless of specificity, and our Tailwind v4 utilities live in
        `@layer utilities` — so on every form control in the dashboard `pl-*`, `pr-*`, `ps-*` and
        `pe-*` silently compute to 0. Verified in production: a `<div class="pl-10">` gets 40px, an
        `<input class="pl-10">` gets 0px. Only `px-*` survives (it emits `padding-inline`, a
        different property from the reset's physical shorthand).

        That is why this collision outlived one "fix" already — the class was always right and never
        applied. An inline style sits above every author rule, so it cannot be reset away.

        The root fix (layering the Horizon bundle) is R-136: verified to work, but it also reverts
        `bg-brand-500` from Denku's #422AFB to Tailwind's default blue, because the brand palette
        currently lives in that same unlayered bundle. It needs the theme ported first.
      */}
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={label}
        style={{ paddingInlineStart: "2.5rem", paddingInlineEnd: "0.75rem" }}
        className={`${CONTROL_BASE} w-full`}
      />
    </div>
  );
}
