import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INDUSTRIES, getIndustry } from "@/lib/marketing/industries";
import { getEmployee } from "@/lib/marketing/employees";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";
import { Reveal } from "@/components/marketing/landing/primitives";
import {
  SubpageCta,
  SubpageFaq,
  SubpageHero,
} from "@/components/marketing/landing/SubpageShell";

export function generateStaticParams() {
  return INDUSTRIES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) return { title: "Not found" };
  return {
    title: `AI receptionist for ${industry.name.toLowerCase()}`,
    description: industry.sub,
    alternates: { canonical: `/industries/${industry.slug}` },
  };
}

export default async function IndustryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const industry = getIndustry(slug);
  if (!industry) notFound();

  const recommended = getEmployee(industry.recommend);

  return (
    <>
      <SubpageHero eyebrow={industry.name} title={industry.headline} sub={industry.sub}>
        {recommended && (
          <EmployeeCard
            name={recommended.name}
            role={recommended.role}
            glyph={recommended.glyph}
            ticker={recommended.ticker}
            fragments={[]}
          />
        )}
      </SubpageHero>

      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-10">
            <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
              Where the calls go.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {industry.pain.map((p, i) => (
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

      {recommended && (
        <section className="relative w-full px-6 py-12 md:px-8">
          <div className="mx-auto max-w-5xl">
            <Reveal>
              <div className="flex flex-col items-start justify-between gap-5 rounded-[20px] border border-[var(--d-border)] p-7 sm:flex-row sm:items-center">
                <div>
                  <div className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
                    We&apos;d start you with
                  </div>
                  <div className="mt-2 font-display text-[22px] font-semibold text-[var(--d-ink)]">
                    {recommended.name} · {recommended.role}
                  </div>
                  <p className="mt-1.5 text-[15px] text-[var(--d-ink-soft)]">{recommended.line}</p>
                </div>
                <Link
                  href={`/employees/${recommended.slug}`}
                  className="shrink-0 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
                >
                  What it does →
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      <SubpageFaq items={industry.faq} />
      <SubpageCta />
    </>
  );
}
