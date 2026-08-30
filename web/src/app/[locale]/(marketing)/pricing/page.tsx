import type { Metadata } from "next";
import Link from "next/link";
import { pricingPlans } from "@/components/marketing/pricing-data";
import { LIVE_CHANNELS, BETA_CHANNELS } from "@/lib/marketing/content/channels";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Printed prices, month to month. Plans from $149. Voice minutes are what you pay for; Telegram and email are included.",
  alternates: { canonical: "/pricing" },
};

/**
 * Pricing — rebuilt for the dark canvas, restyled only.
 *
 * The plan names, prices, limits and Stripe destinations all come from
 * `pricing-data.ts`, which mirrors `billing_plan_catalog`. Nothing on this page
 * decides what anything costs.
 *
 * Two deliberate decisions recorded here:
 *
 *  1. **One ladder, not two.** The benchmark prices chat and voice as separate
 *     products ($349+ / $749+). Denku doesn't, because Denku's billing meters
 *     voice minutes and nothing else — so messaging channels genuinely cost the
 *     customer nothing extra. Inventing a second price list would be inventing a
 *     second meter that doesn't exist.
 *
 *  2. **Plan names stay Starter / Growth / Scale.** Doc 14 proposed Solo / Team /
 *     Scale, but the plan codes are baked into the billing system, Stripe and the
 *     dashboard. A visitor buying "Team" and landing in an account that says
 *     "Growth" is a support ticket for a cosmetic gain.
 */

const MATH = [
  {
    q: "How a minute is counted",
    a: "Each call is rounded up to the next whole minute, then the calls are added together. A 20-second call costs one minute. A 61-second call costs two.",
  },
  {
    q: "What happens past your included minutes",
    a: "You pay the overage rate printed on your plan. It is per minute, counted the same way.",
  },
  {
    q: "What happens at the cap",
    a: "Every workspace has a hard spend cap. When you reach it we pause the line and tell you. We do not keep billing past it and settle up later.",
  },
  {
    q: "What is not metered",
    a: "Telegram and email conversations. They are included, and there is no message counter to run out of.",
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="relative w-full overflow-hidden px-6 pb-14 pt-28 md:px-8 md:pt-32">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% -20%, rgba(47,163,154,.20), transparent 65%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          <div className="mb-6 font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            Pricing
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            Printed prices. Month to month.
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            You pay for voice minutes. Everything else your employee does is included.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="relative w-full px-6 pb-10 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3">
          {pricingPlans.map((plan, i) => {
            const featured = Boolean(plan.highlight);
            const bullets = plan.coreBullets ?? plan.features.slice(0, 5);
            return (
              <Reveal key={plan.name} delay={i * 90}>
                <div
                  className={`landing-glass flex h-full flex-col p-8 ${featured ? "landing-sweep" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-[24px] font-semibold text-[var(--d-ink)]">
                      {plan.name}
                    </h2>
                    {featured && (
                      <span className="rounded-full border border-[rgba(200,148,104,.34)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-copper)]">
                        Most picked
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-[14px] text-[var(--d-ink-faint)]">{plan.subtitle}</p>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[46px] font-semibold leading-none text-[var(--d-ink)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {plan.price ?? plan.monthlyPrice}
                    </span>
                    <span className="text-[14px] text-[var(--d-ink-faint)]">
                      {plan.priceUnit ?? "/ month"}
                    </span>
                  </div>

                  <ul className="mt-7 flex flex-1 flex-col gap-2.5">
                    {bullets.map((b) => (
                      <li
                        key={b}
                        className="flex items-start gap-2.5 text-[14.5px] leading-snug text-[var(--d-ink-soft)]"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-copper)]"
                        />
                        {b}
                      </li>
                    ))}
                    <li className="mt-2 flex items-start gap-2.5 border-t border-[var(--d-border)] pt-3 text-[14.5px] leading-snug text-[var(--d-ink-soft)]">
                      <span
                        aria-hidden="true"
                        className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-teal)]"
                      />
                      Telegram &amp; email included, unmetered
                    </li>
                  </ul>

                  <Link
                    href={plan.cta.href}
                    className={`mt-8 inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium transition-colors ${
                      featured
                        ? "bg-[var(--d-copper)] text-[#0A1414] hover:bg-[#D9A87C]"
                        : "border border-[var(--d-border)] text-[var(--d-ink-soft)] hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                    }`}
                  >
                    {plan.cta.label}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* What the price is actually for */}
      <section className="relative w-full px-6 py-16 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)] md:grid-cols-3">
              {[
                {
                  k: "You pay for",
                  v: "Voice minutes",
                  n: "Rounded up per call, then added together.",
                },
                {
                  k: "Included",
                  v: `${LIVE_CHANNELS.filter((c) => c.id !== "voice").length} more channels`,
                  n: "Telegram and email. No message counter.",
                },
                {
                  k: "Not sold yet",
                  v: `${BETA_CHANNELS.length} in beta`,
                  n: "Messenger, WhatsApp, SMS, web chat. Not in any plan.",
                },
              ].map((c) => (
                <div key={c.k} className="bg-[var(--d-bg)] px-7 py-8">
                  <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                    {c.k}
                  </div>
                  <div className="mt-3 font-display text-[26px] font-semibold text-[var(--d-ink)]">
                    {c.v}
                  </div>
                  <p className="mt-2 text-[14px] leading-relaxed text-[var(--d-ink-soft)]">{c.n}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* The honesty block — doc 18's W6 */}
      <section className="relative w-full px-6 py-16 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-10">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
              The billing math
            </div>
            <h2 className="mt-4 font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
              No surprise invoices. Ever.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
              Here is exactly how the number on your card is produced.
            </p>
          </Reveal>

          <div className="flex flex-col gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)]">
            {MATH.map((m, i) => (
              <Reveal key={m.q} delay={i * 60}>
                <div className="bg-[var(--d-bg)] px-7 py-6">
                  <div className="font-display text-[17px] font-semibold text-[var(--d-ink)]">
                    {m.q}
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">{m.a}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={260}>
            <div className="mt-6 rounded-[20px] border border-dashed border-[var(--d-border)] px-7 py-6">
              <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                Worked example
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                Forty calls averaging 90 seconds. Each rounds to 2 minutes, so that is{" "}
                <span className="text-[var(--d-ink)]">80 minutes</span> — comfortably inside
                Starter&apos;s 400. You pay $149 and nothing else.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <SubpageCta label="Start with one employee." />
    </>
  );
}
