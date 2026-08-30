import type { Metadata } from "next";
import Link from "next/link";
import { EMPLOYEES } from "@/lib/marketing/employees";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";
import { Reveal } from "@/components/marketing/landing/primitives";
import { SubpageCta } from "@/components/marketing/landing/SubpageShell";

export const metadata: Metadata = {
  title: "The roster",
  description:
    "Five AI employees you can hire for your phone line: receptionist, booking assistant, missed-call rescue, after hours, and support.",
  alternates: { canonical: "/employees" },
};

export default function EmployeesIndexPage() {
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
            The roster
          </div>
          <h1 className="max-w-3xl font-display text-[clamp(34px,5vw,68px)] font-semibold leading-[.98] tracking-[-.02em] text-[var(--d-ink)]">
            Five employees. One phone line.
          </h1>
          <p className="mt-6 max-w-lg text-[18px] leading-relaxed text-[var(--d-ink-soft)]">
            Each one is the same system, briefed for a different job.
          </p>
        </div>
      </section>

      <section className="relative w-full px-6 pb-16 md:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EMPLOYEES.map((e, i) => (
            <Reveal key={e.slug} delay={i * 70}>
              <Link
                href={`/employees/${e.slug}`}
                className="group block h-full"
                aria-label={`${e.role}: ${e.line}`}
              >
                <div className="flex h-full flex-col gap-4">
                  <EmployeeCard
                    name={e.name}
                    role={e.role}
                    glyph={e.glyph}
                    ticker={e.ticker}
                    fragments={[]}
                    className="[&>div]:max-w-none"
                  />
                  <p className="px-1 text-[14.5px] leading-relaxed text-[var(--d-ink-soft)] transition-colors group-hover:text-[var(--d-ink)]">
                    {e.line}
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <SubpageCta />
    </>
  );
}
