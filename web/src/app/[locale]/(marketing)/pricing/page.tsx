import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { pricingPlans } from "@/components/marketing/pricing-data";
import { LIVE_CHANNELS, BETA_CHANNELS } from "@/lib/marketing/content/channels";
import { routing } from "@/i18n/routing";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";
import { ChatPlans } from "@/components/marketing/landing/ChatPlans";

/**
 * Pricing — restyle and translate only.
 *
 * The plan names, prices, limits and Stripe destinations all come from
 * `pricing-data.ts`, which mirrors `billing_plan_catalog`. Nothing on this page
 * decides what anything costs, and the plan names stay untranslated on purpose:
 * "Starter" in the site and "Starter" in the billing account have to be the same
 * word in every language, or support tickets follow.
 *
 * Two decisions recorded here:
 *
 *  1. **One ladder, not two.** The benchmark prices chat and voice as separate
 *     products. Denku's billing meters voice minutes and nothing else, so
 *     messaging channels genuinely cost the customer nothing extra. A second price
 *     list would be a second meter that does not exist.
 *  2. **Plan names stay Starter / Growth / Scale.** Doc 14 proposed renaming them,
 *     but the codes are baked into billing, Stripe and the dashboard.
 */

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricingPage" });
  return {
    title: t("eyebrow"),
    description: t("sub"),
    alternates: { canonical: "/pricing" },
  };
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("pricingPage");

  const math = t.raw("math") as { q: string; a: string }[];
  const extraLive = LIVE_CHANNELS.filter((c) => c.id !== "voice").length;

  const summary = [
    { k: t("payFor"), v: t("payForV"), n: t("payForN") },
    { k: t("inc"), v: t("incV", { count: extraLive }), n: t("incN") },
    { k: t("notSold"), v: t("notSoldV", { count: BETA_CHANNELS.length }), n: t("notSoldN") },
  ];

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
            {t("eyebrow")}
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h1>
          <p className="mt-6 max-w-xl text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            {t("sub")}
          </p>
        </div>
      </section>

      <section className="relative w-full px-6 pb-10 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3">
          {pricingPlans.map((plan, i) => {
            const featured = Boolean(plan.highlight);
            // Prices and limits come from pricing-data.ts (which mirrors
            // billing_plan_catalog); only the wording around them is translated.
            const bullets = t.raw(`plans.${plan.name}.bullets`) as string[];
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
                        {t("mostPicked")}
                      </span>
                    )}
                  </div>

                  <div className="mt-6 flex items-baseline gap-1.5">
                    <span
                      className="font-display text-[46px] font-semibold leading-none text-[var(--d-ink)]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {plan.price ?? plan.monthlyPrice}
                    </span>
                    <span className="text-[14px] text-[var(--d-ink-faint)]">
                      {t("perMonth")}
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
                      {t("included")}
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
                    {t("planCta")}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      <ChatPlans />

      {/* What the price is actually for */}
      <section className="relative w-full px-6 py-16 md:px-8">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)] md:grid-cols-3">
              {summary.map((c) => (
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
              {t("mathEyebrow")}
            </div>
            <h2 className="mt-4 font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
              {t("mathHeadline")}
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
              {t("mathSub")}
            </p>
          </Reveal>

          <div className="flex flex-col gap-px overflow-hidden rounded-[20px] border border-[var(--d-border)] bg-[var(--d-border)]">
            {math.map((mItem, i) => (
              <Reveal key={mItem.q} delay={i * 60}>
                <div className="bg-[var(--d-bg)] px-7 py-6">
                  <div className="font-display text-[17px] font-semibold text-[var(--d-ink)]">
                    {mItem.q}
                  </div>
                  <p className="mt-2 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                    {mItem.a}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={260}>
            <div className="mt-6 rounded-[20px] border border-dashed border-[var(--d-border)] px-7 py-6">
              <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                {t("exampleTitle")}
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("exampleBody")}
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      <SubpageCta label={t("cta")} />
    </>
  );
}
