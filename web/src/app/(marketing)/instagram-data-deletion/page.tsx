import { getDeletionStatus } from "@/lib/instagram/dataDeletion";

export const dynamic = "force-dynamic";

/**
 * Public status page for a Meta Data Deletion Request (the `url` returned by the
 * data-deletion callback). Looks up the request by its confirmation code — a
 * capability URL — and shows the status. No PII is displayed.
 */
export default async function InstagramDataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; id?: string }>;
}) {
  const sp = await searchParams;
  const code = (sp?.code || sp?.id || "").trim();
  const record = code ? await getDeletionStatus(code) : null;

  const statusLabel =
    record?.status === "completed"
      ? "Completed"
      : record?.status === "failed"
        ? "Needs attention"
        : record?.status === "received"
          ? "In progress"
          : "Not found";

  return (
    <main className="brand-surface mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-5 py-16">
      <h1 className="font-display text-2xl font-semibold text-[#0A1A2F]">
        Instagram data deletion
      </h1>
      <p className="mt-2 text-sm text-[#2C3E54]">
        This page shows the status of a data deletion request for a Denku-connected
        Instagram account.
      </p>

      <div className="mt-6 rounded-2xl border border-[#0A1A2F]/10 bg-white p-6 shadow-sm">
        {!code ? (
          <p className="text-sm text-[#6B7888]">
            No confirmation code provided. Use the link Instagram gave you.
          </p>
        ) : record ? (
          <dl className="space-y-3 text-sm">
            <Row label="Status" value={statusLabel} />
            <Row label="Confirmation code" value={record.confirmation_code} mono />
            <Row label="Requested" value={new Date(record.requested_at).toLocaleString()} />
            {record.completed_at && (
              <Row label="Completed" value={new Date(record.completed_at).toLocaleString()} />
            )}
          </dl>
        ) : (
          <p className="text-sm text-[#6B7888]">
            No request found for confirmation code{" "}
            <span className="font-mono">{code}</span>.
          </p>
        )}
      </div>

      <p className="mt-6 text-xs text-[#6B7888]">
        Deletion removes the stored Instagram connection and any persisted Instagram
        events for the account. Questions? Contact support.
      </p>
    </main>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[#6B7888]">{label}</dt>
      <dd className={`text-[#0A1A2F] ${mono ? "font-mono text-xs" : "font-medium"}`}>{value}</dd>
    </div>
  );
}
