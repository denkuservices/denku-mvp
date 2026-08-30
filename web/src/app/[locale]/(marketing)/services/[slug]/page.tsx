import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SERVICES, getService } from "@/lib/marketing/content/services";
import { Reveal } from "@/components/marketing/landing/primitives";
import { ChannelGrid } from "@/components/marketing/landing/ChannelGrid";
import { SubpageCta, SubpageHero } from "@/components/marketing/landing/SubpageShell";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) return { title: "Not found" };
  return {
    title: service.name,
    description: service.sub,
    alternates: { canonical: `/services/${service.slug}` },
  };
}

export default async function ServicePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const service = getService(slug);
  if (!service) notFound();

  return (
    <>
      <SubpageHero eyebrow={service.name} title={service.headline} sub={service.sub}>
        {service.slug === "ai-employees" ? (
          <EmployeeCard
            name="Ava"
            role="Receptionist · Voice"
            glyph="◍"
            ticker={["Answered 12 calls today", "Booked a 9:30am estimate"]}
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
                How it's delivered
              </div>
              <p className="mt-2 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {service.delivery}
              </p>
            </div>
          </div>
        )}
      </SubpageHero>

      {/* What you get */}
      <section className="relative w-full px-6 py-20 md:px-8">
        <div className="mx-auto max-w-5xl">
          <Reveal className="mb-10">
            <h2 className="font-display text-[clamp(26px,3.4vw,40px)] font-semibold leading-[1.05] tracking-[-.02em] text-[var(--d-ink)]">
              What you get.
            </h2>
          </Reveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {service.includes.map((item, i) => (
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

      {/* Delivery + pricing, stated plainly */}
      <section className="relative w-full px-6 py-12 md:px-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          <Reveal>
            <div className="h-full rounded-[20px] border border-[var(--d-border)] p-7">
              <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-teal)]">
                How it works
              </h3>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {service.delivery}
              </p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="h-full rounded-[20px] border border-[rgba(200,148,104,.30)] p-7">
              <h3 className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-copper)]">
                What it costs
              </h3>
              <p className="mt-4 text-[15.5px] leading-relaxed text-[var(--d-ink-soft)]">
                {service.pricing}
              </p>
              <Link
                href={service.cta.href}
                className="mt-6 inline-flex items-center gap-2 font-brand-mono text-[12px] uppercase tracking-[.14em] text-[var(--d-copper)] hover:underline"
              >
                {service.cta.label} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {service.slug === "ai-employees" && <ChannelGrid />}

      <SubpageCta
        label={
          service.pricePrinted
            ? "Your next employee starts today."
            : "Tell us what you need."
        }
      />
    </>
  );
}
