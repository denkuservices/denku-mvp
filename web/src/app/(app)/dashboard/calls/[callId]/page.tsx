import Link from "next/link";

// =================================================================================
// Data Fetching & Auth Helpers
// =================================================================================

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function getBaseUrl() {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site && site.includes("localhost")) return site;
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

async function adminGetJSON<T>(path: string): Promise<T> {
  const base = getBaseUrl();
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      Authorization: toBasicAuthHeader(),
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Admin API failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

// =================================================================================
// Formatting Helpers
// =================================================================================

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { timeZone: "UTC", timeZoneName: "short" });
}

function formatDuration(sec?: number | null) {
  if (sec === null || sec === undefined) return "—";
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function money(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "bg-green-100 text-green-800";
  }
  if (lower.includes("ended")) {
    return "bg-gray-100 text-gray-800";
  }
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) {
    return "bg-red-100 text-red-800";
  }
  return "bg-blue-100 text-blue-800";
}

// =================================================================================
// Types
// =================================================================================

type CallRow = {
  id: string;
  vapi_call_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  cost_usd: number | string | null;
  outcome: string | null;
  transcript: string | null;
  raw_payload: string | null; // This is a stringified JSON
};

type AdminCallDetailResponse = {
  ok: boolean;
  call?: CallRow | null;
  error?: string;
};

// =================================================================================
// Page Component
// =================================================================================

export default async function CallDetailPage({
  params,
}: {
  params: { callId: string };
}) {
  const { callId } = params;

  let payload: AdminCallDetailResponse;
  try {
    payload = await adminGetJSON<AdminCallDetailResponse>(
      `/api/admin/calls/${callId}`
    );
  } catch (e: any) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-md border border-red-200 bg-red-50 p-4">
          <h2 className="text-lg font-semibold text-red-900">
            Failed to load call data
          </h2>
          <p className="mt-2 text-sm text-red-800">{e?.message ?? "Unknown error"}</p>
        </div>
      </div>
    );
  }

  const call = payload.call;

  if (!call) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 text-center">
        <h1 className="text-2xl font-semibold">Call not found</h1>
        <p className="mt-2 text-gray-600">The requested call does not exist.</p>
        <div className="mt-6">
          <Link
            href="/dashboard/calls"
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Back to Calls
          </Link>
        </div>
      </div>
    );
  }

  const parsedPayload = (() => {
    try {
      return JSON.parse(call.raw_payload ?? "{}");
    } catch {
      return null;
    }
  })();

  const recordingUrl =
    parsedPayload?.message?.artifact?.recordingUrl ??
    parsedPayload?.message?.artifact?.recording?.mono?.combinedUrl ??
    parsedPayload?.message?.artifact?.recording?.stereoUrl ??
    null;

  const transcript =
    call.transcript ?? parsedPayload?.message?.artifact?.transcript ?? null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      {/* Breadcrumb & Header */}
      <div>
        <div className="text-sm text-gray-500">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link> /{" "}
          <Link href="/dashboard/calls" className="hover:underline">Calls</Link> /{" "}
          <span className="text-gray-700">Call</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Call Detail</h1>
        <div className="mt-1 space-x-4 text-xs text-gray-500">
          <span>ID: {call.id}</span>
          {call.vapi_call_id && <span>Vapi ID: {call.vapi_call_id}</span>}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiCard title="Started" value={formatDate(call.started_at)} />
        <KpiCard title="Ended" value={formatDate(call.ended_at)} />
        <KpiCard title="Duration" value={formatDuration(call.duration_sec)} />
        <KpiCard title="Cost" value={money(call.cost_usd)} />
      </div>

      {/* Outcome & Recording */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Section title="Outcome">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium ${outcomeBadgeClass(call.outcome)}`}>
            {call.outcome || "—"}
          </span>
        </Section>
        <Section title="Recording">
          {recordingUrl ? (
            <Link
              href={recordingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-gray-50"
            >
              Open Recording
            </Link>
          ) : (
            <p className="text-gray-700">—</p>
          )}
        </Section>
      </div>

      {/* Transcript */}
      <Section title="Transcript">
        {transcript ? (
          <pre className="whitespace-pre-wrap rounded-md border bg-gray-50 p-4 text-sm text-gray-800 font-mono">
            {transcript}
          </pre>
        ) : (
          <p className="text-gray-700">—</p>
        )}
      </Section>

      {/* Raw Payload */}
      <Section title="Raw Payload">
        <pre className="max-h-96 overflow-y-auto rounded-md border bg-gray-900 p-4 text-xs text-green-300 font-mono">
          {parsedPayload
            ? JSON.stringify(parsedPayload, null, 2)
            : call.raw_payload ?? "No raw payload."}
        </pre>
      </Section>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-1 text-base font-medium text-gray-900">{value}</div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-sm font-medium text-gray-500">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}