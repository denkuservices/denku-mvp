import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { STUDIO_GROUPS, STUDIO_MAKES, STUDIO_PROCESS } from "@/lib/marketing/content/studio";
import { Reveal } from "./primitives";

/**
 * The three sections that turn `/services/ai-studio` from a description into an offer:
 * what the studio makes, what the packages cost, and what happens between the brief and
 * the delivery.
 *
 * Prices come from `STUDIO_GROUPS` rather than the message files, so a number cannot say
 * one thing in Turkish and another in German. Words come from the message files, so a
 * number is never trapped in a sentence that only exists in English.
 *
 * On imagery: the benchmark carries this page on photographs of finished client work.
 * Denku has none yet, and inventing them — generating sample images and presenting them
 * as a portfolio — would be a fabricated body of work. So the visual weight here comes
 * from the landing system itself. The gallery goes in when there is real work to show.
 */

export async function StudioMakes() {
  const t = await getTranslations("studio.makes");

  return (
    <section className="relative w-full px-6 py-16 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-8 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-teal)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {STUDIO_MAKES.map((id, i) => (
            <Reveal key={id} delay={i * 40}>
              <div className="landing-glass h-full px-5 py-4 text-[14.5px] leading-snug text-[var(--d-ink-soft)]">
                {t(`items.${id}`)}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function StudioPlans() {
  const t = await getTranslations("studio");
  const tp = await getTranslations("pricingPage");

  return (
    // `scroll-mt` keeps the section heading clear of the fixed navbar when the hero's
    // "see the packages" link jumps here — without it the eyebrow lands under the bar.
    <section id="studio-plans" className="relative w-full scroll-mt-24 px-6 py-16 md:px-8">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mb-12 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
            {t("plans.eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(28px,3.8vw,46px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
            {t("plans.headline")}
          </h2>
          <p className="mt-4 text-[16px] leading-relaxed text-[var(--d-ink-soft)]">
            {t("plans.sub")}
          </p>
        </Reveal>

        {STUDIO_GROUPS.map((group) => (
          <div key={group.id} className="mb-14 last:mb-0">
            <Reveal className="mb-6 flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[15px]"
                style={{
                  background:
                    "linear-gradient(150deg, rgba(47,163,154,.24), rgba(200,148,104,.16))",
                  border: "1px solid var(--d-border)",
                }}
              >
                {group.glyph}
              </span>
              <h3 className="font-display text-[22px] font-semibold text-[var(--d-ink)]">
                {t(`groups.${group.id}.name`)}
              </h3>
            </Reveal>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {group.tiers.map((tier, i) => {
                const base = `groups.${group.id}.tiers.${tier.id}`;
                const features = t.raw(`${base}.features`) as string[];
                return (
                  <Reveal key={tier.id} delay={i * 90}>
                    <div
                      className={`landing-glass flex h-full flex-col p-8 ${
                        tier.featured ? "landing-sweep" : ""
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <h4 className="font-display text-[20px] font-semibold text-[var(--d-ink)]">
                          {t(`${base}.name`)}
                        </h4>
                        {tier.featured && (
                          <span className="shrink-0 rounded-full border border-[rgba(200,148,104,.34)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-copper)]">
                            {tp("mostPicked")}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[13.5px] text-[var(--d-ink-faint)]">
                        {t(`${base}.volume`)}
                      </div>

                      <div className="mt-6 flex items-baseline gap-1.5">
                        <span className="font-brand-mono text-[13px] text-[var(--d-ink-faint)]">
                          {t("plans.from")}
                        </span>
                        <span
                          className="font-display text-[40px] font-semibold leading-none text-[var(--d-ink)]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          ${tier.priceUsd}
                        </span>
                      </div>

                      <ul className="mt-7 flex flex-1 flex-col gap-2.5">
                        {features.map((f) => (
                          <li
                            key={f}
                            className="flex items-start gap-2.5 text-[14.5px] leading-snug text-[var(--d-ink-soft)]"
                          >
                            <span
                              aria-hidden="true"
                              className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--d-copper)]"
                            />
                            {f}
                          </li>
                        ))}
                      </ul>

                      <div className="mt-6 border-t border-[var(--d-border)] pt-4 text-[13px] leading-snug text-[var(--d-ink-faint)]">
                        {t(`${base}.who`)}
                      </div>

                      <Link
                        href="/request?service=ai-studio"
                        className={`mt-6 inline-flex items-center justify-center rounded-full px-6 py-3.5 text-[15px] font-medium transition-colors ${
                          tier.featured
                            ? "bg-[var(--d-copper)] text-[#0A1414] hover:bg-[#D9A87C]"
                            : "border border-[var(--d-border)] text-[var(--d-ink-soft)] hover:border-[rgba(200,148,104,.4)] hover:text-[var(--d-ink)]"
                        }`}
                      >
                        {t("plans.cta")}
                      </Link>
                    </div>
                  </Reveal>
                );
              })}
            </div>
          </div>
        ))}

        {/* Why there is no checkout button on any of the six. */}
        <Reveal delay={120}>
          <div className="rounded-[20px] border border-[var(--d-border)] px-7 py-6">
            <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
              {t("plans.noteTitle")}
            </div>
            <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
              {t("plans.note")}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export async function StudioProcess() {
  const t = await getTranslations("studio.process");

  return (
    <section className="relative w-full px-6 py-16 md:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal className="mb-10 max-w-2xl">
          <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-teal)]">
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
            {t("headline")}
          </h2>
        </Reveal>
        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STUDIO_PROCESS.map((id, i) => (
            <Reveal key={id} delay={i * 80}>
              <li className="flex h-full flex-col rounded-[20px] border border-[var(--d-border)] p-6">
                <span className="font-brand-mono text-[11px] text-[var(--d-copper)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-[var(--d-ink)]">
                  {t(`steps.${id}.name`)}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--d-ink-soft)]">
                  {t(`steps.${id}.body`)}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
