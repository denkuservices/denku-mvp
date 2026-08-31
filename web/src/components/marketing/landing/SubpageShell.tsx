"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Magnetic, Reveal, SplitHeading } from "./primitives";
import { ExternalToLocale } from "@/components/marketing/ExternalToLocale";

/**
 * Shared chrome for the dark subpages (`/employees/*`, `/industries/*`).
 *
 * Keeping the hero, the section rhythm and the closing CTA in one place is what
 * stops the template pages from drifting into a fourth design dialect — the exact
 * problem doc 06 found on the benchmark, where the showcase site and the product
 * site are visibly different products.
 */

/** One of the hero's two buttons. A `#hash` href renders a plain anchor, since a
 *  same-page jump must not be run through the locale-prefixing router. */
type HeroCta = { label: string; href: string };

export function SubpageHero({
  eyebrow,
  title,
  sub,
  emphasis,
  children,
  primaryCta,
  secondaryCta,
}: {
  eyebrow: string;
  title: string;
  sub: string;
  emphasis?: string[];
  children?: React.ReactNode;
  /** Defaults to the voice demo. Override on pages where there is nothing to hear. */
  primaryCta?: HeroCta;
  /** Defaults to the homepage plans. Override where the page carries its own prices. */
  secondaryCta?: HeroCta;
}) {
  const tc = useTranslations("common");
  const primary = primaryCta ?? { label: tc("hearItNow"), href: "/#demo" };
  const secondary = secondaryCta ?? { label: tc("seePricing"), href: "/#pricing" };

  return (
    <section className="relative w-full overflow-hidden px-6 pb-16 pt-28 md:px-8 md:pt-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(47,163,154,.20), transparent 65%)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="mb-6 font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            {eyebrow}
          </div>
          <SplitHeading
            text={title}
            emphasis={emphasis}
            className="font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]"
          />
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            {sub}
          </p>
          <div className="mt-9 flex flex-wrap gap-3.5">
            <Magnetic>
              {primary.href.startsWith("#") ? (
                <a
                  href={primary.href}
                  className="inline-flex items-center gap-2.5 rounded-full bg-[var(--d-copper)] px-7 py-3.5 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C]"
                >
                  {primary.label}
                  <span aria-hidden="true">→</span>
                </a>
              ) : (
                <Link
                  href={primary.href}
                  className="inline-flex items-center gap-2.5 rounded-full bg-[var(--d-copper)] px-7 py-3.5 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C]"
                >
                  {primary.label}
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </Magnetic>
            {secondary.href.startsWith("#") ? (
              <a
                href={secondary.href}
                className="inline-flex items-center rounded-full border border-[var(--d-border)] px-6 py-3.5 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
              >
                {secondary.label}
              </a>
            ) : (
              <Link
                href={secondary.href}
                className="inline-flex items-center rounded-full border border-[var(--d-border)] px-6 py-3.5 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">{children}</div>
      </div>
    </section>
  );
}

/** A day in the life — the Thread, told vertically. */
export function DayTimeline({ beats }: { beats: { when: string; what: string }[] }) {
  const t = useTranslations("subpage");

  return (
    <section className="relative w-full px-6 py-20 md:px-8">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-10">
          <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
            {t("dayTitle")}
          </h2>
        </Reveal>
        <ol className="relative flex flex-col gap-7 border-l border-[var(--d-border)] pl-7">
          {beats.map((b, i) => (
            <Reveal key={`${b.when}-${i}`} delay={i * 80} as="li" className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-[33px] top-[7px] h-2 w-2 rounded-full"
                style={{ background: i === beats.length - 1 ? "var(--d-copper)" : "var(--d-teal)" }}
              />
              <div className="font-brand-mono text-[10.5px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]">
                {b.when}
              </div>
              <div className="mt-1 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
                {b.what}
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * What it does / what it doesn't. Both columns render; the second is the point.
 * Stating the gap plainly is cheaper than having a customer discover it.
 */
export function CapabilityColumns({
  does,
  notYet,
}: {
  does: string[];
  notYet: string[];
}) {
  const t = useTranslations("subpage");

  return (
    <section className="relative w-full px-6 py-20 md:px-8">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
        <Reveal>
          <div className="landing-glass h-full p-7">
            <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-teal)]">
              {t("doesTitle")}
            </h3>
            <ul className="mt-5 flex flex-col gap-3">
              {does.map((d) => (
                <li key={d} className="flex items-start gap-3 text-[15px] leading-snug text-[var(--d-ink-soft)]">
                  <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-teal)]" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={90}>
          <div className="h-full rounded-[20px] border border-dashed border-[var(--d-border)] p-7">
            <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
              {t("notYetTitle")}
            </h3>
            <ul className="mt-5 flex flex-col gap-3">
              {notYet.map((d) => (
                <li key={d} className="flex items-start gap-3 text-[15px] leading-snug text-[var(--d-ink-faint)]">
                  <span aria-hidden="true" className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-ink-faint)]" />
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SubpageFaq({ items }: { items: { q: string; a: string }[] }) {
  const t = useTranslations("subpage");
  if (items.length === 0) return null;
  return (
    <section className="relative w-full px-6 py-20 md:px-8">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-8">
          <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
            {t("faqTitle")}
          </h2>
        </Reveal>
        <div className="flex flex-col">
          {items.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className="group border-t border-[var(--d-border)] last:border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16px] font-medium text-[var(--d-ink)] [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[var(--d-copper)] transition-transform duration-300 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="pb-6 pr-10 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                  {item.a}
                </p>
              </details>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function SubpageCta({ label }: { label?: string }) {
  const t = useTranslations("subpage");
  const tc = useTranslations("common");
  const heading = label ?? t("ctaDefault");

  return (
    <section className="relative w-full overflow-hidden px-6 py-28 md:px-8">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 90% at 50% 120%, rgba(200,148,104,.14), transparent 65%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="font-display text-[clamp(28px,4.2vw,52px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {heading}
          </h2>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Magnetic>
              <Link
                href="/#demo"
                className="inline-flex items-center gap-2.5 rounded-full bg-[var(--d-copper)] px-7 py-3.5 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C]"
              >
                {tc("talkToDenku")}
                <span aria-hidden="true">→</span>
              </Link>
            </Magnetic>
            <ExternalToLocale
              href="/signup"
              className="inline-flex items-center rounded-full border border-[var(--d-border)] px-6 py-3.5 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
            >
              {tc("startHiring")}
            </ExternalToLocale>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
