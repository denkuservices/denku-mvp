"use client";

import { Link } from "@/i18n/navigation";
import { pricingPlans } from "@/components/marketing/pricing-data";
import { Reveal } from "./primitives";
import { useTranslations } from "next-intl";

/**
 * Pricing preview — plan §5 row 8.
 *
 * Restyle only: the plan data, prices and Stripe destinations all come from
 * `pricing-data.ts` unchanged. Nothing here decides what anything costs.
 *
 * The honesty block underneath is doc 18's W6 — the spend cap presented as the
 * feature it is, aimed squarely at contract resentment in this category.
 */
export function PricingPreview() {
  const t = useTranslations("home.pricing");
  const tp = useTranslations("pricingPage");

  return (
    <section id="pricing" className="relative w-full px-6 py-28 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-14 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-ink-faint)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(32px,4.4vw,54px)] font-semibold leading-[1.02] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {pricingPlans.map((plan, i) => {
            const featured = Boolean(plan.highlight);
            const bullets = tp.raw(`plans.${plan.name}.bullets`) as string[];
            return (
              <Reveal key={plan.name} delay={i * 90}>
                <div
                  className={`landing-glass flex h-full flex-col p-7 ${featured ? "landing-sweep" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[22px] font-semibold text-[var(--d-ink)]">
                      {plan.name}
                    </h3>
                    {featured && (
                      <span className="rounded-full border border-[rgba(200,148,104,.34)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-copper)]">
                        {t("mostPicked")}
                      </span>
                    )}
                  </div>

                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[42px] font-semibold leading-none text-[var(--d-ink)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {plan.price ?? plan.monthlyPrice}
                    </span>
                    <span className="text-[14px] text-[var(--d-ink-faint)]">
                      {tp("perMonth")}
                    </span>
                  </div>

                  {plan.concurrencyLine && (
                    <div className="mt-2 font-brand-mono text-[11px] uppercase tracking-[.12em] text-[var(--d-teal)]">
                      {plan.concurrencyLine}
                    </div>
                  )}

                  <ul className="mt-6 flex flex-1 flex-col gap-2.5">
                    {bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 text-[14px] leading-snug text-[var(--d-ink-soft)]"
                      >
                        <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-copper)]" />
                        {b}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.cta.href}
                    className={`mt-7 inline-flex items-center justify-center rounded-full px-6 py-3 text-[14.5px] font-medium transition-colors ${
                      featured
                        ? "bg-[var(--d-copper)] text-[#0A1414] hover:bg-[#D9A87C]"
                        : "border border-[var(--d-border)] text-[var(--d-ink-soft)] hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                    }`}
                  >
                    {tp("planCta")}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200} className="mt-6">
          <div className="flex flex-col items-start justify-between gap-4 rounded-[20px] border border-[var(--d-border)] px-7 py-6 sm:flex-row sm:items-center">
            <div>
              <div className="font-display text-[18px] font-semibold text-[var(--d-ink)]">
                {t("noSurprise")}
              </div>
              <p className="mt-1.5 max-w-xl text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("noSurpriseBody")}
              </p>
            </div>
            <Link
              href="/pricing"
              className="shrink-0 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
            >
              {t("seeMath")}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default PricingPreview;
