import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import Link from "next/link";
import { INDUSTRIES } from "@/lib/marketing/industries";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "industries" });
  return { title: t("eyebrow"), description: t("headline"), alternates: { canonical: "/industries" } };
}

export default async function IndustriesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("industries");

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
        </div>
      </section>

      <section className="relative w-full px-6 pb-16 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-2">
          {INDUSTRIES.map((ind, i) => (
            <Reveal key={ind.slug} delay={i * 80}>
              <Link href={`/industries/${ind.slug}`} className="landing-glass group block h-full p-8">
                <div className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-copper)]">
                  {t(`items.${ind.slug}.name`)}
                </div>
                <h2 className="mt-3.5 font-display text-[26px] font-semibold leading-tight text-[var(--d-ink)]">
                  {t(`items.${ind.slug}.headline`)}
                </h2>
                <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                  {t(`items.${ind.slug}.sub`)}
                </p>
                <span
                  aria-hidden="true"
                  className="mt-6 inline-block text-[var(--d-copper)] transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <SubpageCta />
    </>
  );
}
