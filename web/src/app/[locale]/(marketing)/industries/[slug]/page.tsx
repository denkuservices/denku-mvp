import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import { INDUSTRIES, getIndustry } from "@/lib/marketing/industries";
import { getEmployee } from "@/lib/marketing/employees";
import { routing } from "@/i18n/routing";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";
import { Reveal } from "@/components/marketing/landing/primitives";
import {
  SubpageCta,
  SubpageFaq,
  SubpageHero,
} from "@/components/marketing/landing/SubpageShell";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    INDUSTRIES.map((i) => ({ locale, slug: i.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getIndustry(slug)) return { title: "Not found" };
  const t = await getTranslations({ locale, namespace: `industries.items.${slug}` });
  return {
    title: t("name"),
    description: t("sub"),
    alternates: { canonical: `/industries/${slug}` },
  };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const industry = getIndustry(slug);
  if (!industry) notFound();

  const t = await getTranslations(`industries.items.${slug}`);
  const ti = await getTranslations("industries");
  const recommended = getEmployee(industry.recommend);
  const te = recommended
    ? await getTranslations(`employees.items.${recommended.slug}`)
    : null;

  return (
    <>
      <SubpageHero eyebrow={t("name")} title={t("headline")} sub={t("sub")}>
        {recommended && te && (
          <EmployeeCard
            name={recommended.name}
            role={te("role")}
            glyph={recommended.glyph}
            ticker={te.raw("ticker") as string[]}
            fragments={[]}
          />
        )}
      </SubpageHero>

      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-10">
            <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
              {ti("whereCallsGo")}
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {(t.raw("pain") as string[]).map((p, i) => (
              <Reveal key={p} delay={i * 80}>
                <div className="landing-glass h-full p-6">
                  <div className="font-brand-mono text-[11px] tracking-[.16em] text-[var(--d-copper)]">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <p className="mt-3 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">{p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {recommended && te && (
        <section className="relative w-full px-6 py-12 md:px-8">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] border border-[var(--d-border)] p-7 sm:flex-row sm:items-center">
                <div>
                  <div className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                    {ti("wedStartYouWith")}
                  </div>
                  <div className="mt-2 font-display text-[22px] font-semibold text-[var(--d-ink)]">
                    {recommended.name} · {te("role")}
                  </div>
                  <p className="mt-1.5 text-[15px] text-[var(--d-ink-soft)]">{te("line")}</p>
                </div>
                <Link
                  href={`/employees/${recommended.slug}`}
                  className="shrink-0 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
                >
                  {ti("whatItDoes")} →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <SubpageFaq items={t.raw("faq") as { q: string; a: string }[]} />
      <SubpageCta />
    </>
  );
}
