import React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import Card from "@/components/ui-horizon/card";
import { Badge } from "@/components/ui-horizon/badge";
import { EmptyState as HorizonEmptyState } from "@/components/ui-horizon/empty";
import { Stat } from "@/components/ui-horizon/stat";
import {
  CONTROL_BASE_CLASS,
  FILLED_CONTROL_BASE,
} from "@/components/ui-horizon/controls";

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

/**
 * A single headline number. `note` must stay truthful (R-018) — say "recent N" when bounded.
 *
 * Renders the shared `Stat` primitive rather than its own card. It used to hand-roll the label,
 * value and note inside a `Surface`, which meant two stat treatments in the product: this one and
 * `ui-horizon/stat`, differing in label case, size and spacing. The wrapper survives because it
 * adds something `Stat` does not — the whole tile can be a link.
 */
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
  const body = <Stat label={label} value={value} helperText={note} className="transition hover:shadow-xl" />;
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
 *
 * Renders the shared `ui-horizon/empty` primitive. There were two components called `EmptyState`,
 * in two files, drawing different things — a grey circle and a bare link here, a brand-tinted
 * rounded square and an arbitrary action node there. Same name, same job, two looks: the reader of
 * an import line had no way to know which one they were getting.
 *
 * This wrapper keeps the `action: { label, href }` shape its seventeen call sites pass, and turns
 * it into the link the shared primitive renders in its action slot.
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
    <HorizonEmptyState
      title={title}
      description={description}
      icon={Icon ? <Icon /> : undefined}
      action={
        action ? (
          <Link
            href={action.href}
            className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            {action.label}
          </Link>
        ) : undefined
      }
    />
  );
}

/**
 * Consistent status pill.
 *
 * A thin naming layer over the shared `Badge`. Both existed and both drew a pill, at different
 * paddings (`px-2 py-0.5` against `px-2.5 py-1`), so two adjacent surfaces showed two pill sizes
 * for the same idea. The tone vocabulary stays because it reads better at the call site — a
 * conversation is `critical`, not `destructive` — and because nineteen files use it.
 *
 * The pulsing `ok` dot is the one thing Badge does not do on its own: `ok` means *answering right
 * now*, and a pulse is how a live state reads at a glance. Every other tone is steady, and
 * `motion-reduce` stops it for anyone who has asked the OS not to animate.
 */
export function Pill({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "critical" | "info";
  dot?: boolean;
  className?: string;
}) {
  const variants = {
    neutral: "default",
    ok: "success",
    warn: "warning",
    critical: "destructive",
    info: "info",
  } as const;

  return (
    <Badge
      variant={variants[tone]}
      dot={dot}
      className={`${tone === "ok" && dot ? "[&>span:first-child]:animate-pulse motion-reduce:[&>span:first-child]:animate-none" : ""} ${className}`}
    >
      {children}
    </Badge>
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
 * The form-control recipe now lives in `@/components/ui-horizon/controls` and is re-exported here.
 *
 * It used to be declared in this file AND in that one, under the same name `CONTROL_CLASS`, with
 * different looks — `rounded-lg`/`ring-2`/`navy-800`/`px-3` here against
 * `rounded-xl`/`shadow-sm`/`ring-4`/`navy-900`/`px-3.5` there. Forty-odd surfaces wore this one and
 * three newly-migrated pages wore the other, so the constant that was supposed to guarantee
 * consistency was itself the thing making the dashboard inconsistent.
 *
 * The values did not change; only their address did. The re-export is what keeps this file's forty
 * importers working without touching any of them — and a primitive belongs in `components/`, not
 * in a route-private folder that pages outside `_platform` have to reach into.
 */
export { CONTROL_CLASS } from "@/components/ui-horizon/controls";

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
  value,
  onChange,
  placeholder,
  label,
  tone = "outlined",
  className = "",
}: {
  name?: string;
  defaultValue?: string;
  /** Controlled value — for surfaces that filter as you type instead of on submit. */
  value?: string;
  onChange?: (value: string) => void;
  placeholder: string;
  /** Accessible name — the field has no visible <label>. */
  label: string;
  /**
   * `outlined` is the dashboard's form-control chrome, matched to the selects beside it.
   * `filled` is the messaging chrome: a soft-filled pill with no border, for the Inbox, where
   * the field stands alone at the top of a panel and an outline would draw a second box inside
   * an already-bounded pane.
   *
   * A variant rather than a second component on purpose — the icon offset and the input's left
   * padding must stay paired (see the note above), and that pairing is what this file exists to
   * guarantee.
   */
  tone?: "outlined" | "filled";
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />
      {/*
        The magnifier sits inside the field, so the text starts clear of it.

        This padding was an inline style for a while: the unlayered Horizon bundle used to kill
        every directional padding utility on form controls, so `pl-10` computed to 0 and the
        placeholder rendered on top of the icon. R-136 put that bundle in a cascade layer, so the
        utility applies again and the escape hatch is no longer needed.
      */}
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        placeholder={placeholder}
        aria-label={label}
        className={`${tone === "filled" ? FILLED_CONTROL_BASE : CONTROL_BASE_CLASS} w-full pl-10 pr-3`}
      />
    </div>
  );
}
