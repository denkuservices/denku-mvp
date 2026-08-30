import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import Link from "next/link";
import { SERVICES } from "@/lib/marketing/content/services";
import { Reveal } from "@/components/marketing/landing/primitives";
import { ChannelGrid } from "@/components/marketing/landing/ChannelGrid";
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
  const t = await getTranslations({ locale, namespace: "services" });
  return { title: t("eyebrow"), description: t("sub"), alternates: { canonical: "/services" } };
}

export default async function ServicesIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("services");
  const ts = await getTranslations("subpage");

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
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            {t("sub")}
          </p>
        </div>
      </section>

      <section className="relative w-full px-6 pb-12 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-2">
          {SERVICES.map((s, i) => (
            <Reveal key={s.slug} delay={i * 80}>
              <Link href={`/services/${s.slug}`} className="landing-glass group flex h-full flex-col p-8">
                <div className="flex items-start justify-between gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-[18px]"
                    style={{
                      background:
                        "linear-gradient(150deg, rgba(47,163,154,.24), rgba(200,148,104,.16))",
                      border: "1px solid var(--d-border)",
                    }}
                  >
                    {s.glyph}
                  </span>
                  <span className="rounded-full border border-[var(--d-border)] px-2.5 py-1 font-brand-mono text-[9px] uppercase tracking-[.14em] text-[var(--d-ink-faint)]">
                    {s.kind === "product" ? ts("platform") : ts("doneForYou")}
                  </span>
                </div>

                <h2 className="mt-6 font-display text-[26px] font-semibold leading-tight text-[var(--d-ink)]">
                  {t(`items.${s.slug}.name`)}
                </h2>
                <p className="mt-2.5 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                  {t(`items.${s.slug}.line`)}
                </p>

                <div className="mt-auto flex items-center justify-between gap-4 pt-7">
                  <span className="font-brand-mono text-[11px] text-[var(--d-ink-faint)]">
                    {s.pricePrinted ? ts("pricePrinted") : ts("quoted")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-[var(--d-copper)] transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <ChannelGrid />
      <SubpageCta label={t("notSure")} />
    </>
  );
}
