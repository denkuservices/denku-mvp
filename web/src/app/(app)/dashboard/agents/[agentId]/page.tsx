// src/app/(app)/dashboard/calls/[callId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";

type CallDetailResponse = {
  ok?: boolean;
  data?: CallDetail | null;
  call?: CallDetail | null; // backward-compat
};

type CallDetail = {
  id: string;
  vapi_call_id?: string | null;
  agent_id?: string | null;
  org_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  cost_usd?: number | string | null;
  outcome?: string | null;
  transcript?: string | null;
  raw_payload?: any;
  created_at?: string | null;
};

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

/**
 * Server-side fetch base selection:
 * - If NEXT_PUBLIC_SITE_URL points to localhost, use it.
 * - Else if VERCEL_URL exists, use that (prod/staging).
 * - Else fallback to localhost:3000.
 */
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

function fmt(input?: string | null) {
  if (!input) return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function money(v?: number | string | null) {
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
  const call = res.data ?? res.call ?? null;

  if (!call) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="text-sm text-gray-500">
          <Link href="/dashboard/agents" className="hover:underline">
            Agents
          </Link>{" "}
          / <span className="text-gray-700">Call</span>
        </div>

        <h1 className="mt-2 text-2xl font-semibold">Call not found</h1>
        <p className="mt-1 text-sm text-gray-600">No record for callId: {callId}</p>

        <div className="mt-4">
          <Link
            href="/dashboard/agents"
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Back to Agents
          </Link>
        </div>
      </div>
    );
  }

  const outcome = (call.outcome ?? "").toString();
  const lower = outcome.toLowerCase();
  const badgeClass =
    lower.includes("completed") || lower.includes("end-of-call-report")
      ? "bg-green-100 text-green-800"
      : lower.includes("ended")
      ? "bg-gray-100 text-gray-800"
      : "bg-blue-100 text-blue-800";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>{" "}
            /{" "}
            <Link href="/dashboard/agents" className="hover:underline">
              Agents
            </Link>{" "}
            / <span className="text-gray-700">Call</span>
          </div>

          <h1 className="mt-2 text-2xl font-semibold">Call Detail</h1>
          <p className="mt-1 text-sm text-gray-600">
            Internal ID: <span className="font-mono">{call.id}</span>
          </p>
          {call.vapi_call_id ? (
            <p className="mt-1 text-sm text-gray-600">
              Vapi call id: <span className="font-mono">{call.vapi_call_id}</span>
            </p>
          ) : null}
        </div>

        <Link
          href="/dashboard/agents"
          className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Back to Agents
        </Link>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Started</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{fmt(call.started_at)}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Ended</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{fmt(call.ended_at)}</div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Duration</div>
          <div className="mt-1 text-sm font-medium text-gray-900">
            {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">Cost</div>
          <div className="mt-1 text-sm font-medium text-gray-900">{money(call.cost_usd)}</div>
        </div>
      </div>

      <div className="mt-4">
        <span
          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}
        >
          {outcome || "—"}
        </span>
      </div>

      <div className="mt-8 rounded-lg border bg-white p-4">
        <div className="text-sm font-semibold">Transcript</div>
        <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
          {call.transcript ?? "—"}
        </pre>
      </div>

      <div className="mt-6 rounded-lg border bg-white p-4">
        <div className="text-sm font-semibold">Raw Payload</div>
        <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap text-xs text-gray-700">
          {call.raw_payload ? JSON.stringify(call.raw_payload, null, 2) : "—"}
        </pre>
      </div>
    </div>
  );
}
