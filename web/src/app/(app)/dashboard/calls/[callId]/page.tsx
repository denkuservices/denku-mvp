// src/app/(app)/dashboard/calls/[callId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

type CallDetail = {
  id: string;
  vapi_call_id?: string | null;
  agent_id?: string | null;
  lead_id?: string | null;
  org_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  cost_usd?: number | string | null;
  status?: string | null;
  outcome?: string | null;
  transcript?: string | null;
  raw_payload?: any;
  raw?: unknown; // backward compat
  created_at?: string | null;
};

type CallDetailResponse = {
  ok?: boolean;
  data?: CallDetail | null;
};

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

function getBaseUrl() {
  // DEV: always use localhost
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";

  // PROD/STAGING
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (site) return site;

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

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function formatMoney(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = await params;

  const res = await adminGetJSON<CallDetailResponse>(`/api/admin/calls/${callId}`);
  const call = res.data ?? null;

  if (!call) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              <span>/</span>
              <Link href="/dashboard/agents" className="hover:underline">
                Agents
              </Link>
              <span>/</span>
              <span className="text-gray-900">Call</span>
            </div>

            <h1 className="mt-2 text-xl font-semibold">Call not found</h1>
            <p className="mt-1 text-sm text-gray-600">
              No record for callId <span className="font-mono">{callId}</span>
            </p>
          </div>

          <Link
            href="/dashboard/agents"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const backHref = call.agent_id ? `/dashboard/agents/${call.agent_id}` : "/dashboard/agents";
  const backLabel = call.agent_id ? "Back to Agent" : "Back to Agents";

  const outcome = (call.outcome ?? "").toString();
  const lower = outcome.toLowerCase();
  const badgeClass =
    lower.includes("completed") || lower.includes("end-of-call-report")
      ? "bg-green-100 text-green-800"
      : lower.includes("ended")
      ? "bg-gray-100 text-gray-800"
      : "bg-blue-100 text-blue-800";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/dashboard/agents" className="hover:underline">
              Agents
            </Link>
            <span>/</span>
            <span className="text-gray-900">Call</span>
          </div>

          <h1 className="mt-2 text-xl font-semibold">Call Detail</h1>
          <p className="mt-1 text-sm text-gray-600">
            Detailed record for call <span className="font-mono">{call.id}</span>
          </p>
          {call.vapi_call_id ? (
            <p className="mt-1 text-sm text-gray-600">
              Vapi call id: <span className="font-mono">{call.vapi_call_id}</span>
            </p>
          ) : null}
        </div>

        <Link
          href={backHref}
          className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          {backLabel}
        </Link>
      </div>

      <div className="mt-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}
        >
          {outcome || "—"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border bg-white p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Summary</h2>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-600">Started</dt>
              <dd className="text-sm text-gray-900">{formatDate(call.started_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Ended</dt>
              <dd className="text-sm text-gray-900">{formatDate(call.ended_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Duration</dt>
              <dd className="text-sm text-gray-900">
                {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Cost</dt>
              <dd className="text-sm text-gray-900">{formatMoney(call.cost_usd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Status</dt>
              <dd className="text-sm text-gray-900">{call.status ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Outcome</dt>
              <dd className="text-sm text-gray-900">{call.outcome ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Identifiers</h2>
          <div className="mt-3 space-y-2 text-sm">
            <div>
              <div className="text-xs text-gray-600">Call ID</div>
              <div className="font-mono text-gray-900">{call.id}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Vapi Call ID</div>
              <div className="font-mono text-gray-900">{call.vapi_call_id ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Agent ID</div>
              <div className="font-mono text-gray-900">{call.agent_id ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-gray-600">Lead ID</div>
              <div className="font-mono text-gray-900">{call.lead_id ?? "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {call.transcript ?? "—"}
          </pre>
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Raw JSON</h2>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {call.raw_payload
              ? JSON.stringify(call.raw_payload, null, 2)
              : call.raw
              ? JSON.stringify(call.raw, null, 2)
              : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
