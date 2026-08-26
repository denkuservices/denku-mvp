import React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import Card from "@/components/ui-horizon/card";

/**
 * The Settings design kit.
 *
 * **Why this exists.** Settings was the last surface still written in raw Tailwind. Every other
 * platform surface renders through `_platform/ui` primitives that wrap the Horizon `Card`, so
 * consistency there is structural; Settings approximated it by copying class strings, and the
 * copies had drifted — Workspace and Account used `gray/navy`, Billing used `zinc`, three
 * different button recipes lived within two scroll-lengths of each other, and the only icons on
 * the entire surface were a clipboard and a warning triangle.
 *
 * More importantly it was **unreadable at a glance**. Settings is a page people arrive at with one
 * specific question ("where do I change my password", "how many minutes have I used"), and the old
 * layout answered every question at exactly the same volume: a grey heading, a white box, a line
 * of grey text. Nothing had a shape you could aim at.
 *
 * So the kit is built around one idea: **every distinct thing gets an icon anchor and a tone.**
 * You find the section by its glyph before you read its title, and a destructive control never
 * looks like a save button. Tones are semantic (`brand` = configuration, `danger` = irreversible,
 * `ok/warn/critical` = live state) and never decorative.
 *
 * Everything here is presentational and hook-free on purpose, so a server page and a client form
 * can both import it without a `"use client"` boundary being forced onto either.
 */

/* ------------------------------------------------------------------ tones */

export type Tone = "brand" | "neutral" | "ok" | "warn" | "critical" | "info";

/** Icon-tile chrome per tone. Full class strings — never interpolated, so Tailwind sees them. */
const TILE_TONES: Record<Tone, string> = {
  brand: "bg-brand-500/10 text-brand-500 dark:bg-brand-400/15 dark:text-brand-300",
  neutral: "bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300",
  ok: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300",
  warn: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  critical: "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300",
  info: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
};

const TILE_SIZES = {
  sm: "h-8 w-8 rounded-lg [&>svg]:h-4 [&>svg]:w-4",
  md: "h-10 w-10 rounded-xl [&>svg]:h-5 [&>svg]:w-5",
  lg: "h-12 w-12 rounded-2xl [&>svg]:h-6 [&>svg]:w-6",
} as const;

/**
 * The anchor glyph. Used for section headings, panel headers, stat tiles and empty states, so a
 * customer scanning the page lands on shapes rather than on paragraphs.
 */
export function IconTile({
  icon: Icon,
  tone = "brand",
  size = "md",
  className = "",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center ${TILE_SIZES[size]} ${TILE_TONES[tone]} ${className}`}
    >
      <Icon />
    </span>
  );
}

/* -------------------------------------------------------------------- hero */

/**
 * The page header.
 *
 * Billing and Audit used to render a gradient card carrying a four-level breadcrumb
 * (Dashboard / Settings / Workspace / Billing) while Workspace and Account rendered a bare `h1` —
 * two different headers on one surface, one of which duplicated the nav rail sitting beside it.
 * This is the single header, and it carries **status instead of breadcrumbs**: what a customer
 * needs on arrival is "which workspace, is it live, what plan", not the path they just walked.
 */
export function SettingsHero({
  icon,
  title,
  subtitle,
  badge,
  pills,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Rendered in place of the icon tile — e.g. a workspace/user avatar. */
  badge?: React.ReactNode;
  pills?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-[20px] border border-gray-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-navy-800">
      {/* A single soft brand wash. Decoration is allowed to be quiet; it is here to give the
          header a horizon line, not to compete with the content below it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-400/10"
      />

      <div className="relative flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {badge ?? <IconTile icon={icon} size="lg" />}
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
            ) : null}
            {pills ? <div className="mt-3 flex flex-wrap items-center gap-2">{pills}</div> : null}
          </div>
        </div>

        {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- section */

/**
 * A titled group of panels. `id` is load-bearing: `#identity`, `#members`, `#profile`,
 * `#security` and `#usage` are shipped URLs that the merged-page redirects still point at.
 */
export function SettingsSection({
  id,
  icon,
  title,
  hint,
  action,
  children,
}: {
  id?: string;
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconTile icon={icon} size="sm" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy-700 dark:text-white">{title}</h2>
            {hint ? <p className="mt-0.5 text-sm text-gray-500">{hint}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------- panel */

/** A card. Wraps the same Horizon `Card` every other dashboard surface uses. */
export function Panel({
  children,
  className = "",
  padded = true,
  tone,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
  /** `critical` tints the panel red — reserved for controls that cannot be undone. */
  tone?: "critical";
}) {
  const toneClass =
    tone === "critical"
      ? "!border !border-red-200 !bg-red-50/50 dark:!border-red-500/20 dark:!bg-red-500/5"
      : "border border-gray-200/80 dark:border-white/10";
  return (
    <Card extra={`${padded ? "p-6" : ""} ${toneClass} ${className}`}>{children}</Card>
  );
}

/** Panel header — icon, what it is, what it's for, and (optionally) its control. */
export function PanelHeader({
  icon,
  title,
  description,
  tone = "brand",
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  tone?: Tone;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0">
          <p className="text-base font-semibold text-navy-700 dark:text-white">{title}</p>
          {description ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- pill */

const PILL_TONES: Record<Tone, string> = {
  brand:
    "border-brand-200 bg-brand-500/10 text-brand-600 dark:border-brand-400/20 dark:bg-brand-400/10 dark:text-brand-300",
  neutral:
    "border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300",
  ok: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  critical:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
};

const PILL_DOTS: Record<Tone, string> = {
  brand: "bg-brand-500",
  neutral: "bg-gray-400",
  ok: "bg-green-500",
  warn: "bg-amber-500",
  critical: "bg-red-500",
  info: "bg-blue-500",
};

/**
 * Status pill. `dot` pulses only on `ok`, because there it means *currently live* — every other
 * tone is a steady state and a pulse would be decoration (the same rule the platform `Pill` uses).
 */
export function StatusPill({
  children,
  tone = "neutral",
  icon: Icon,
  dot = false,
}: {
  children: React.ReactNode;
  tone?: Tone;
  icon?: LucideIcon;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${PILL_DOTS[tone]} ${
            tone === "ok" ? "animate-pulse motion-reduce:animate-none" : ""
          }`}
        />
      ) : Icon ? (
        <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      ) : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- stat */

/**
 * One number, with the glyph that says what it counts.
 *
 * Deliberately not the dashboard `Widget`: this one has to survive a four-across grid inside a
 * panel, and it needs an optional `hint` line for the honesty notes Billing depends on.
 */
export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-2xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start gap-2.5">
        <IconTile icon={icon} tone={tone} size="sm" />
        {/* Wraps rather than truncates: in a four-across grid these labels are the only thing
            saying what the number means, and "Next auto-collect at" clipped to "NEXT AUT…" is a
            tile with no meaning at all. */}
        <p className="min-w-0 text-xs font-semibold uppercase leading-tight tracking-wide text-gray-500">
          {label}
        </p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-navy-700 dark:text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------- meter */

/**
 * A consumption bar.
 *
 * The single most important fact on the Billing page is *how much of what you paid for is left*,
 * and it was the one number the page never drew. The fill changes tone as it fills — green under
 * 75%, amber to 90%, red past it — so the state is legible before the digits are read.
 */
export function Meter({
  value,
  max,
  label,
  valueLabel,
  tone,
}: {
  value: number;
  max: number;
  label?: string;
  valueLabel?: string;
  /** Force a tone; otherwise derived from how full the bar is. */
  tone?: "ok" | "warn" | "critical" | "brand";
}) {
  const pct = max > 0 ? Math.min(Math.round((value / max) * 100), 100) : 0;
  const derived: "ok" | "warn" | "critical" = pct >= 90 ? "critical" : pct >= 75 ? "warn" : "ok";
  const fill = {
    ok: "bg-green-500",
    warn: "bg-amber-500",
    critical: "bg-red-500",
    brand: "bg-brand-500",
  }[tone ?? derived];

  return (
    <div className="space-y-2">
      {label || valueLabel ? (
        <div className="flex items-center justify-between gap-2 text-xs font-semibold text-gray-600 dark:text-gray-400">
          <span>{label}</span>
          <span className="tabular-nums">{valueLabel ?? `${pct}%`}</span>
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/10"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${fill}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ button */

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300",
  secondary:
    "border border-gray-200 bg-white text-navy-700 shadow-sm hover:bg-gray-50 dark:border-white/10 dark:bg-navy-800 dark:text-white dark:hover:bg-white/5",
  ghost:
    "text-gray-600 hover:bg-gray-100 hover:text-navy-700 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white",
  danger:
    "border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50 dark:border-red-500/25 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50 [&>svg]:h-4 [&>svg]:w-4";

/**
 * The one button recipe for Settings.
 *
 * The surface had three: a shadcn `Button`, a local one inside the Billing page, and hand-written
 * class strings everywhere else. The visible cost was hierarchy — "Save changes" and "Cancel"
 * rendered as identical white outlines, so the affirmative action was invisible. Primary is
 * `brand-500` per the house rule; destructive is never primary.
 */
export function SettingsButton({
  variant = "secondary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`} {...rest} />;
}

/** Same chrome, as a link — so a navigation CTA can't drift from a button beside it. */
export function SettingsLinkButton({
  href,
  variant = "secondary",
  className = "",
  children,
  external,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const cls = `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${className}`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ fields */

/** Label + optional glyph, shared by every control so labels can't drift apart. */
export function FieldLabel({
  icon: Icon,
  children,
  required,
  htmlFor,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 dark:text-white"
    >
      {Icon ? <Icon aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" /> : null}
      {children}
      {required ? <span className="text-red-500">*</span> : null}
    </label>
  );
}

/**
 * Input chrome, exported rather than re-typed.
 *
 * Padding is composed by each control instead of overridden — an input with a leading icon adds
 * `pl-10` to `INPUT_CHROME`, which carries no horizontal padding of its own. (Tailwind v4 resolves
 * `px-*` and `pl-*` by stylesheet order, not attribute order, so an override is a coin flip.)
 */
export const INPUT_CHROME =
  "w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm text-navy-700 shadow-sm transition placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500 dark:border-white/10 dark:bg-navy-900 dark:text-white dark:disabled:bg-white/5";

export const INPUT_CLASS = `${INPUT_CHROME} px-4`;
export const INPUT_WITH_ICON_CLASS = `${INPUT_CHROME} pl-10 pr-4`;

/** A labelled field with a leading glyph inside the control. */
export function IconField({
  id,
  icon: Icon,
  label,
  helper,
  required,
  children,
}: {
  id?: string;
  icon?: LucideIcon;
  label: string;
  helper?: string;
  required?: boolean;
  /** The control itself — it must carry `INPUT_WITH_ICON_CLASS` when an icon is given. */
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor={id} required={required}>
        {label}
      </FieldLabel>
      <div className="relative">
        {Icon ? (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
        ) : null}
        {children}
      </div>
      {helper ? <p className="text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ notice */

const NOTICE_TONES = {
  ok: {
    box: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
    icon: "text-green-600 dark:text-green-400",
  },
  warn: {
    box: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    icon: "text-amber-600 dark:text-amber-400",
  },
  critical: {
    box: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
    icon: "text-red-600 dark:text-red-400",
  },
  info: {
    box: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
    icon: "text-blue-600 dark:text-blue-400",
  },
} as const;

/** Inline result/status message. One shape for saved, failed, blocked and explained. */
export function Notice({
  tone,
  icon: Icon,
  title,
  children,
  action,
}: {
  tone: keyof typeof NOTICE_TONES;
  icon: LucideIcon;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const t = NOTICE_TONES[tone];
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 ${t.box}`}>
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${t.icon}`} />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-1 opacity-90" : ""}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
