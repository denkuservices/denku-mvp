// web/src/app/(app)/dashboard/calls/[callId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CallRow = {
  id: string;
  vapi_call_id: string | null;
  org_id: string | null;
  agent_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | string | null;
  outcome: string | null;
  transcript: string | null;
  raw_payload: string | null; // DB’de text
  created_at: string | null;
};

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

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "bg-green-100 text-green-800";
  }
  if (lower.includes("ended")) return "bg-gray-100 text-gray-800";
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) {
    return "bg-red-100 text-red-800";
  }
  return "bg-blue-100 text-blue-800";
}

function safeParseRawPayload(raw: string | null): any | null {
  if (!raw) return null;

  // Bazı kayıtlar "\"{...}\"" (double-encoded) şeklinde geliyor.
  // 1) JSON.parse dene -> string çıkarsa tekrar JSON.parse
  try {
    const first = JSON.parse(raw);
    if (typeof first === "string") {
      try {
        return JSON.parse(first);
      } catch {
        return first;
      }
    }
    return first;
  } catch {
    // raw zaten JSON değilse: string olarak döndür
    return raw;
  }
}

function findRecordingUrl(obj: any): string | null {
  if (!obj || typeof obj !== "object") return null;

  // En yaygın yerler:
  // message.artifact.recordingUrl
  // message.artifact.recording.mono.combinedUrl
  // message.artifact.recording.stereoUrl
  // message.artifact.stereoRecordingUrl
  const msg = obj?.message ?? obj;

  const candidates = [
    msg?.artifact?.recordingUrl,
    msg?.artifact?.stereoRecordingUrl,
    msg?.artifact?.recording?.stereoUrl,
    msg?.artifact?.recording?.mono?.combinedUrl,
    msg?.artifact?.recording?.mono?.assistantUrl,
    msg?.artifact?.recording?.mono?.customerUrl,
    msg?.artifact?.recordingUrl?.url,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = await params;

  const { data: call, error: callErr } = await supabaseAdmin
    .from("calls")
    .select(
      "id, vapi_call_id, org_id, agent_id, started_at, ended_at, duration_seconds, cost_usd, outcome, transcript, raw_payload, created_at"
    )
    .eq("id", callId)
    .maybeSingle<CallRow>();

  if (callErr) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-semibold">Call Detail</h1>
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Failed to load call: {callErr.message}
        </div>
        <div className="mt-4">
          <Link href="/dashboard/calls" className="hover:underline text-sm">
            Back to Calls
          </Link>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-xl font-semibold">Call not found</h1>
        <p className="mt-1 text-sm text-gray-600">
          No record for callId <span className="font-mono">{callId}</span>
        </p>
        <div className="mt-4">
          <Link
            href="/dashboard/calls"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Back to Calls
          </Link>
        </div>
      </div>
    );
  }

  // Agent name resolve (optional)
  let agentName: string | null = null;
  if (call.agent_id) {
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("name")
      .eq("id", call.agent_id)
      .maybeSingle<{ name: string | null }>();
    agentName = agentRow?.name ?? null;
  }

  const parsedRaw = safeParseRawPayload(call.raw_payload);
  const recordingUrl = findRecordingUrl(parsedRaw);

  const outcome = call.outcome ?? "";
  const badgeClass = outcomeBadgeClass(outcome);

  const backHref = call.agent_id ? `/dashboard/agents/${call.agent_id}` : "/dashboard/calls";
  const backLabel = call.agent_id ? "Back to Agent" : "Back to Calls";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span>/</span>
            <Link href="/dashboard/calls" className="hover:underline">
              Calls
            </Link>
            <span>/</span>
            <span className="text-gray-900">Call</span>
          </div>

          <h1 className="mt-2 text-xl font-semibold">Call Detail</h1>

          <p className="mt-1 text-sm text-gray-600">
            Call ID: <span className="font-mono">{call.id}</span>
          </p>

          {agentName ? (
            <p className="mt-1 text-sm text-gray-600">
              Agent: <span className="font-medium text-gray-900">{agentName}</span>
            </p>
          ) : null}

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
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${badgeClass}`}>
          {outcome || "—"}
        </span>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-3">
        <div className="rounded-md border bg-white p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">KPIs</h2>
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
          </dl>
        </div>

        <div className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Recording</h2>
{recordingUrl && (
  <div className="mt-3">
    <div className="rounded-xl border bg-gray-50 p-4">
      <audio controls className="h-14 w-full">
        <source src={recordingUrl} />
      </audio>
    </div>
  </div>
)}


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
          <h2 className="text-sm font-semibold">Raw Payload</h2>
          <pre className="mt-3 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800">
            {parsedRaw ? JSON.stringify(parsedRaw, null, 2) : call.raw_payload ?? "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
