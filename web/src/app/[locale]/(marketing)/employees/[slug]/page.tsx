import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { EMPLOYEES, getEmployee } from "@/lib/marketing/employees";
import { routing } from "@/i18n/routing";
import { EmployeeCard } from "@/components/marketing/landing/EmployeeCard";
import {
  CapabilityColumns,
  DayTimeline,
  SubpageCta,
  SubpageHero,
} from "@/components/marketing/landing/SubpageShell";

/**
 * Employee detail.
 *
 * `lib/marketing/employees.ts` keeps only the structure — slug, first name, glyph,
 * ordering. Roles, taglines, the day-in-the-life beats, the capability lists and the
 * verticals all come from the message files, so this page is genuinely translated
 * rather than an English page inside a localised shell.
 */

export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    EMPLOYEES.map((e) => ({ locale, slug: e.slug }))
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!getEmployee(slug)) return { title: "Not found" };
  const t = await getTranslations({ locale, namespace: `employees.items.${slug}` });
  return {
    title: t("role"),
    description: t("sub"),
    alternates: { canonical: `/employees/${slug}` },
  };
}

export default async function EmployeePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const employee = getEmployee(slug);
  if (!employee) notFound();

  const t = await getTranslations(`employees.items.${slug}`);
  const ts = await getTranslations("subpage");

  return (
    <>
      <SubpageHero eyebrow={t("role")} title={t("headline")} sub={t("sub")}>
        <EmployeeCard
          name={employee.name}
          role={t("role")}
          glyph={employee.glyph}
          ticker={t.raw("ticker") as string[]}
          fragments={[]}
        />
      </SubpageHero>

      <DayTimeline beats={t.raw("day") as { when: string; what: string }[]} />
      <CapabilityColumns
        does={t.raw("does") as string[]}
        notYet={t.raw("notYet") as string[]}
      />

      <section className="relative w-full px-6 pb-8 md:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2.5">
          <span className="font-brand-mono text-[10.5px] uppercase tracking-[.16em] text-[var(--d-ink-faint)]">
            {ts("fits")}
          </span>
          {(t.raw("fits") as string[]).map((f) => (
            <span
              key={f}
              className="rounded-full border border-[var(--d-border)] px-3 py-1 text-[13px] text-[var(--d-ink-soft)]"
            >
              {f}
            </span>
          ))}
        </div>
      </section>

      <SubpageCta label={t("cta")} />
    </>
  );
}
