import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDeletionStatus } from "@/lib/instagram/dataDeletion";
import { localeAlternates } from "@/i18n/alternates";

export const dynamic = "force-dynamic";

/**
 * Public status page for a Meta Data Deletion Request (the `url` returned by the
 * data-deletion callback). Looks up the request by its confirmation code — a
 * capability URL — and shows the status. No PII is displayed.
 */

/**
 * Only `alternates` — the title and description are inherited from the root layout, and this
 * page has never overridden them. What it must not inherit is a canonical: the root's used to
 * name the English home page for every locale.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: localeAlternates(locale, '/instagram-data-deletion') };
}

export default async function InstagramDataDeletionStatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; id?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("instagramDeletion");

  const sp = await searchParams;
  const code = (sp?.code || sp?.id || "").trim();
  const record = code ? await getDeletionStatus(code) : null;

  const statusLabel =
    record?.status === "completed"
      ? t("completedLabel")
      : record?.status === "failed"
        ? t("statusNeedsAttention")
        : record?.status === "received"
          ? t("statusInProgress")
          : t("statusNotFound");

  return (
    <main className="brand-surface mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-5 py-16">
      <h1 className="font-display text-2xl font-semibold text-[var(--s-ink)]">
        {t("title")}
      </h1>
      <p className="mt-2 text-sm text-[var(--s-ink-soft)]">{t("intro")}</p>

      <div className="mt-6 rounded-2xl border border-[var(--s-border)] bg-[var(--s-panel)] p-6 shadow-sm">
        {!code ? (
          <p className="text-sm text-[var(--s-ink-faint)]">{t("noCode")}</p>
        ) : record ? (
          <dl className="space-y-3 text-sm">
            <Row label={t("statusLabel")} value={statusLabel} />
            <Row label={t("codeLabel")} value={record.confirmation_code} mono />
            <Row
              label={t("requestedLabel")}
              value={new Date(record.requested_at).toLocaleString(locale)}
            />
            {record.completed_at && (
              <Row
                label={t("completedLabel")}
                value={new Date(record.completed_at).toLocaleString(locale)}
              />
            )}
          </dl>
        ) : (
          <p className="text-sm text-[var(--s-ink-faint)]">
            {t("notFound")} <span className="font-mono">{code}</span>.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-[var(--s-ink-faint)]">{t("footnote")}</p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--s-ink-faint)]">{label}</dt>
      <dd className={`text-[var(--s-ink)] ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
