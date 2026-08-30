"use client";

import { Link } from "@/i18n/navigation";
import { Magnetic, Reveal } from "./primitives";
import { useTranslations } from "next-intl";
import { ExternalToLocale } from "@/components/marketing/ExternalToLocale";

/**
 * The closing run — plan §5 rows 9–11.
 *
 * Note on section 7 ("Memory"): it is deliberately NOT a separate section here.
 * The workday story's second act is already the memory argument, told with the
 * real CRM surface; a second section restating it in prose would spend a third of
 * the page's word budget saying the same thing twice.
 */

/** Audit CTA — doc 18's W2. The entry point ships now, the product follows. */
export function AuditCta() {
  const t = useTranslations("home.audit");
  const tc = useTranslations("common");

  return (
    <section className="relative w-full px-6 py-24 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="landing-glass flex flex-col items-start justify-between gap-7 p-9 md:flex-row md:items-center md:p-11">
            <div className="max-w-lg">
              <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
                {t("eyebrow")}
              </div>
              <h2 className="mt-3.5 font-display text-[clamp(26px,3.2vw,38px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
                {t("headline")}
              </h2>
              <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("sub")}
              </p>
            </div>

            <Link
              href="/request?service=ai-audit"
              className="inline-flex shrink-0 items-center gap-2.5 rounded-full border border-[var(--d-border)] px-7 py-3.5 text-[15px] font-medium text-[var(--d-ink)] transition-colors hover:border-[rgba(200,148,104,.5)]"
            >
              {tc("requestAudit")}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}


/** Honest FAQ — plan §5 row 10. Objections answered without marketing hedging. */
export function HonestFaq() {
  const t = useTranslations("home.faq");
  const items = t.raw("items") as { q: string; a: string }[];

  return (
    <section id="faq" className="relative w-full px-6 py-24 md:px-8">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-12">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(30px,4vw,48px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>

        <div className="flex flex-col">
          {items.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className="group border-t border-[var(--d-border)] last:border-b">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-[16.5px] font-medium text-[var(--d-ink)] [&::-webkit-details-marker]:hidden">
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

/** Final CTA — plan §5 row 11. Hero energy, reprised. */
export function FinalCta() {
  const t = useTranslations("home.finalCta");
  const tc = useTranslations("common");

  return (
    <section className="relative w-full overflow-hidden px-6 py-32 md:px-8">
      {/* Light rays, done in CSS. A second WebGL context here would break the
          one-canvas rule for no visual gain at this scale. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 120%, rgba(200,148,104,.16), transparent 65%)," +
            "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(47,163,154,.16), transparent 65%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--d-border) 20%, var(--d-border) 80%, transparent)",
        }}
      />

      <div className="relative mx-auto max-w-3xl text-center">
        <Reveal>
          <h2 className="font-display text-[clamp(34px,5.4vw,68px)] font-semibold leading-[1.0] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}{" "}
            <span className="landing-ember">{t("headlineEmphasis")}</span>.
          </h2>
        </Reveal>
        <Reveal delay={140}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Magnetic>
              <Link
                href="#demo"
                className="inline-flex items-center gap-2.5 rounded-full bg-[var(--d-copper)] px-8 py-4 text-[15px] font-medium text-[#0A1414] transition-colors hover:bg-[#D9A87C]"
              >
                {tc("talkToDenku")}
                <span aria-hidden="true">→</span>
              </Link>
            </Magnetic>
            <ExternalToLocale
              href="/signup"
              className="inline-flex items-center rounded-full border border-[var(--d-border)] px-7 py-4 text-[15px] font-medium text-[var(--d-ink-soft)] transition-colors hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
            >
              {tc("startHiring")}
            </ExternalToLocale>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
