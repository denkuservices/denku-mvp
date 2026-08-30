"use client";

import { Link } from "@/i18n/navigation";
import { EMPLOYEES } from "@/lib/marketing/employees";
import { EmployeeCard } from "./EmployeeCard";
import { Reveal } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * Meet the employees — plan §5 row 5, doc 15 section 5.
 *
 * The product catalogue, rendered as five badges. Each card is the same signature
 * from the hero, which is what turns it into a system rather than a one-off flourish.
 *
 * Every role listed here maps to a template the product can actually run today.
 * The roster itself lives in lib/marketing/employees.ts so this grid and the
 * /employees pages can never drift apart.
 */

export function MeetEmployees() {
  const t = useTranslations("home.roster");
  const te = useTranslations("employees");

  return (
    <section id="employees" className="relative w-full px-6 py-28 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-14 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EMPLOYEES.map((e, i) => (
            <Reveal key={e.slug} delay={i * 70}>
              <Link
                href={`/employees/${e.slug}`}
                className="group block h-full"
                aria-label={`${te(`items.${e.slug}.role`)}: ${te(`items.${e.slug}.line`)}`}
              >
                <div className="flex h-full flex-col gap-4">
                  <EmployeeCard
                    name={e.name}
                    role={te(`items.${e.slug}.role`)}
                    glyph={e.glyph}
                    ticker={te.raw(`items.${e.slug}.ticker`) as string[]}
                    fragments={[]}
                    className="max-w-none [&>div]:max-w-none"
                  />
                  <p className="px-1 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)] transition-colors group-hover:text-[var(--d-ink)]">
                    {te(`items.${e.slug}.line`)}
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}

          <Reveal delay={350}>
            <Link
              href="/employees"
              className="landing-glass flex h-full min-h-[190px] flex-col items-start justify-end p-6 transition-transform hover:-translate-y-0.5"
            >
              <span className="font-display text-[20px] font-semibold text-[var(--d-ink)]">
                {t("seeAll")}
              </span>
              <span className="mt-1.5 text-[14px] text-[var(--d-ink-soft)]">
                {t("seeAllNote")}
              </span>
              <span aria-hidden="true" className="mt-4 text-[var(--d-copper)]">
                →
              </span>
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default MeetEmployees;
