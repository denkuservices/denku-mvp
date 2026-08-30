import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EMPLOYEES, getEmployee } from "@/lib/marketing/employees";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";
import {
  CapabilityColumns,
  DayTimeline,
  SubpageCta,
  SubpageFaq,
  SubpageHero,
} from "@/components/marketing/landing/SubpageShell";

export function generateStaticParams() {
  return EMPLOYEES.map((e) => ({ slug: e.slug }));
}

// Next.js 16: params is a Promise and must be awaited.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const employee = getEmployee(slug);
  if (!employee) return { title: "Not found" };
  return {
    title: `${employee.role} — AI employee`,
    description: employee.sub,
    alternates: { canonical: `/employees/${employee.slug}` },
  };
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const employee = getEmployee(slug);
  if (!employee) notFound();

  return (
    <>
      <SubpageHero
        eyebrow={employee.role}
        title={employee.headline}
        sub={employee.sub}
      >
        <EmployeeCard
          name={employee.name}
          role={employee.role}
          glyph={employee.glyph}
          ticker={employee.ticker}
          fragments={[]}
        />
      </SubpageHero>

      <DayTimeline beats={employee.day} />
      <CapabilityColumns does={employee.does} notYet={employee.notYet} />

      <section className="relative w-full px-6 pb-8 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2.5">
          <span className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
            Fits
          </span>
          {employee.fits.map((f) => (
            <span
              key={f}
              className="rounded-full border border-[var(--d-border)] px-3 py-1 text-[13px] text-[var(--d-ink-soft)]"
            >
              {f}
            </span>
          ))}
        </div>
      </section>

      <SubpageFaq items={[]} />
      <SubpageCta label={`Put ${employee.name} on the phone.`} />
    </>
  );
}
