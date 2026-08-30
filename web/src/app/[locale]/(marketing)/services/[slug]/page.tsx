import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { SERVICES, getService } from "@/lib/marketing/content/services";
import { routing } from "@/i18n/routing";
import { Reveal } from "@/components/marketing/landing/primitives";
import { ChannelGrid } from "@/components/marketing/landing/ChannelGrid";
import { SubpageCta, SubpageHero } from "@/components/marketing/landing/SubpageShell";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";

/**
 * Service detail.
 *
 * Structure (slug, glyph, whether a price is printed, where the CTA points) stays
 * in `lib/marketing/content/services.ts`; every word comes from the message files,
 * keyed by slug. That split is what stopped these pages rendering English inside a
 * Turkish site.
 */

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    SERVICES.map((s) => ({ locale, slug: s.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getService(slug)) return { title: "Not found" };
  const t = await getTranslations({ locale, namespace: `services.items.${slug}` });
  return {
    title: t("name"),
    description: t("sub"),
    alternates: { canonical: `/services/${slug}` },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const service = getService(slug);
  if (!service) notFound();

  const t = await getTranslations(`services.items.${slug}`);
  const ts = await getTranslations("subpage");
  const te = await getTranslations("employees.items.receptionist");
  const includes = t.raw("includes") as string[];

  return (
    <>
      <SubpageHero eyebrow={t("name")} title={t("headline")} sub={t("sub")}>
        {service.slug === "ai-employees" ? (
          <EmployeeCard
            name="Ava"
            role={te("role")}
            glyph="◍"
            ticker={te.raw("ticker") as string[]}
            fragments={[]}
          />
        ) : (
          <div className="landing-glass flex w-full max-w-[330px] flex-col gap-5 p-8">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-[24px]"
              style={{
                background:
                  "linear-gradient(150deg, rgba(47,163,154,.24), rgba(200,148,104,.16))",
                border: "1px solid var(--d-border)",
              }}
            >
              {service.glyph}
            </span>
            <div>
              <div className="font-brand-mono text-[10px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                {ts("howItWorks")}
              </div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("delivery")}
              </p>
            </div>
          </div>
        )}
      </SubpageHero>

      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-10">
            <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
              {ts("whatYouGet")}
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {includes.map((item, i) => (
              <Reveal key={item} delay={i * 70}>
                <div className="landing-glass flex h-full items-start gap-4 p-6">
                  <span className="font-brand-mono text-[11px] text-[var(--d-copper)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">{item}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="relative w-full px-6 py-12 md:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[20px] border border-[var(--d-border)] p-7">
              <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-teal)]">
                {ts("howItWorks")}
              </h3>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("delivery")}
              </p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="h-full rounded-[20px] border border-[rgba(200,148,104,.30)] p-7">
              <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-copper)]">
                {ts("whatItCosts")}
              </h3>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {t("pricing")}
              </p>
              <Link
                href={service.cta.href}
                className="mt-6 inline-flex items-center gap-2 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
              >
                {t("cta")} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {service.slug === "ai-employees" && <ChannelGrid />}

      <SubpageCta />
    </>
  );
}
