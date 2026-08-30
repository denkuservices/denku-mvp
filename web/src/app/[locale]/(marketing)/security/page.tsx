import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "securityPage" });
  return { title: t("eyebrow"), description: t("sub"), alternates: { canonical: "/security" } };
}

/**
 * The trust page.
 *
 * Doc 14 §5: for a small vendor in the US market, a candid trust page beats
 * inflated badges. That is why the last section exists and is not buried — this
 * repo previously shipped SOC 2 and HIPAA claims that were not true, and the
 * correction is not just removing them but saying plainly what the status is.
 *
 * Every control listed here is one the codebase actually implements.
 */


export default async function SecurityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("securityPage");
  const controls = t.raw("controls") as { title: string; body: string }[];
  const notClaimed = t.raw("notClaimed") as { title: string; body: string }[];

  return (
    <>
      <section className="relative w-full overflow-hidden px-6 pb-16 pt-28 md:px-8 md:pt-32">
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

      <section className="relative w-full px-6 py-12 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {controls.map((c, i) => (
            <Reveal key={c.title} delay={i * 60}>
              <div className="landing-glass flex h-full flex-col p-7">
                <div className="font-brand-mono text-[11px] tracking-[.16em] text-[var(--d-teal)]">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h2 className="mt-3.5 font-display text-[20px] font-semibold leading-snug text-[var(--d-ink)]">
                  {c.title}
                </h2>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                  {c.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-3xl">
          <Reveal className="mb-10">
            <div className="font-brand-mono text-[10.5px] uppercase tracking-[.2em] text-[var(--d-copper)]">
              {t("notClaimedEyebrow")}
            </div>
            <h2 className="mt-4 font-display text-[clamp(28px,3.6vw,42px)] font-semibold leading-[1.03] tracking-[-.02em] text-[var(--d-ink)]">
              {t("notClaimedHeadline")}
            </h2>
          </Reveal>

          <div className="flex flex-col gap-4">
            {notClaimed.map((n, i) => (
              <Reveal key={n.title} delay={i * 70}>
                <div className="rounded-[20px] border border-dashed border-[var(--d-border)] p-7">
                  <h3 className="font-display text-[18px] font-semibold text-[var(--d-ink)]">
                    {n.title}
                  </h3>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
                    {n.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={250}>
            <p className="mt-8 text-[15px] leading-relaxed text-[var(--d-ink-soft)]">
              {t("askPrefix")}{" "}
              <Link href="/request" className="text-[var(--d-copper)] hover:underline">
                {t("askLink")}
              </Link>{" "}
              {t("askSuffix")}
            </p>
          </Reveal>
        </div>
      </section>

      <SubpageCta label={t("cta")} />
    </>
  );
}
