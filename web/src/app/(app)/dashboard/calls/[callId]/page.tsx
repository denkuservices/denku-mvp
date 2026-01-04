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
  return `$${n.toFixed(2)}`;
}

function formatMoneyRaw(v?: number | string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(4);
}

function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "—";
  // Simple check for +E.164 format, allow flexibility
  if (phone.length < 8) return phone;
  const start = phone.slice(0, 4);
  const end = phone.slice(-4);
  return `${start}****${end}`;
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

function generateCallSummary(transcript: string | null): string[] {
  if (!transcript) return [];

  const summary: Set<string> = new Set();
  const lowerTranscript = transcript.toLowerCase();

  if (/\b(support|issue|problem)\b/.test(lowerTranscript)) {
    summary.add("Caller requested support");
  }
  if (/\b(demo|pricing|sales|buy)\b/.test(lowerTranscript)) {
    summary.add("Sales-related inquiry");
  }
  if (/\b(appointment|schedule|meeting)\b/.test(lowerTranscript)) {
    summary.add("Appointment discussion");
  }
  if (/\b(name|phone)\b/.test(lowerTranscript)) {
    summary.add("Agent collected caller details");
  }

  return Array.from(summary);
}

function getCallStatus(outcome: string | null, ended_at: string | null): string {
  const lowerOutcome = (outcome ?? "").toLowerCase();
  if (lowerOutcome.includes("completed") || lowerOutcome.includes("end-of-call-report")) {
    return "Completed";
  }
  if (!ended_at) {
    return "In progress";
  }
  return "Unknown";
}

function getDurationDescriptor(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 30) return "Short call";
  if (seconds > 300) return "Long call";
  return null;
}

function getCostDescriptor(cost: number | string | null): string | null {
  const n = Number(cost);
  if (!Number.isFinite(n)) return null;
  if (n < 0.01) return "Low cost";
  if (n > 0.1) return "High cost";
  return null;
}

type TranscriptSegment = {
  speaker: "AI" | "User" | "Other";
  text: string;
};

function parseTranscript(transcript: string | null): TranscriptSegment[] {
  if (!transcript) return [];

  const segments: TranscriptSegment[] = [];
  const lines = transcript.split("\n");
  let currentSpeaker: "AI" | "User" | "Other" | null = null;
  let currentText = "";

  for (const line of lines) {
    const match = line.match(/^(AI|User):\s*(.*)/);
    if (match) {
      const speaker = match[1] as "AI" | "User";
      const text = match[2];

      if (currentSpeaker && currentSpeaker !== speaker) {
        segments.push({ speaker: currentSpeaker, text: currentText.trim() });
        currentText = "";
      }

      currentSpeaker = speaker;
      currentText += (currentText ? "\n" : "") + text;
    } else {
      currentText += (currentText ? "\n" : "") + line;
    }
  }

  if (currentSpeaker && currentText) {
    segments.push({ speaker: currentSpeaker, text: currentText.trim() });
  } else if (currentText) {
    // Handle transcripts with no speaker prefix
    segments.push({ speaker: "Other", text: currentText.trim() });
  }

  return segments.filter((s) => s.text);
}

function generateCallOutcomeInsights(call: CallRow): string[] {
  const insights = new Set<string>();
  const { transcript, outcome, duration_seconds } = call;

  if (transcript) {
    const lowerTranscript = transcript.toLowerCase();
    if (lowerTranscript.includes("support") || lowerTranscript.includes("issue") || lowerTranscript.includes("problem")) {
      insights.add("Caller likely requested support.");
    }
    if (lowerTranscript.includes("appointment") || lowerTranscript.includes("schedule")) {
      if (lowerTranscript.includes("scheduled") || lowerTranscript.includes("booked")) {
        insights.add("An appointment was scheduled.");
      } else {
        insights.add("Appointment scheduling was discussed.");
      }
    } else {
      insights.add("No appointment was scheduled.");
    }
    if (lowerTranscript.includes("sales") || lowerTranscript.includes("pricing") || lowerTranscript.includes("buy")) {
      insights.add("This was a sales-related inquiry.");
    }
    if (lowerTranscript.includes("name") || lowerTranscript.includes("phone") || lowerTranscript.includes("email")) {
      insights.add("Agent asked for contact details.");
    }
  }

  if (outcome) {
    const lowerOutcome = outcome.toLowerCase();
    if (lowerOutcome.includes("failed") || lowerOutcome.includes("error")) {
      insights.add("Call ended with a technical failure.");
    } else if (lowerOutcome.includes("no-answer")) {
      insights.add("The call was not answered.");
    } else if (!lowerOutcome.includes("completed") && !lowerOutcome.includes("end-of-call-report")) {
      insights.add("Call may have ended without a clear resolution.");
    }
  }

  if (duration_seconds !== null) {
    if (duration_seconds < 30) {
      insights.add("This was a very short call.");
    } else if (duration_seconds > 600) {
      insights.add("This was a lengthy call, indicating a complex issue.");
    }
  }

  if (insights.size === 0) {
    insights.add("No specific insights could be generated for this call.");
  }

  return Array.from(insights).slice(0, 5);
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
  const fromNumber = parsedRaw?.call?.from ?? parsedRaw?.message?.call?.from ?? null;
  const toNumber = parsedRaw?.call?.to ?? parsedRaw?.message?.call?.to ?? null;
  const recordingUrl = findRecordingUrl(parsedRaw);
  const callSummary = generateCallSummary(call.transcript);
  const callStatus = getCallStatus(call.outcome, call.ended_at);
  const durationDescriptor = getDurationDescriptor(call.duration_seconds);
  const costDescriptor = getCostDescriptor(call.cost_usd);
  const parsedTranscript = parseTranscript(call.transcript);
  const callInsights = generateCallOutcomeInsights(call);

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
        </div>

        <Link
          href={backHref}
          className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          {backLabel}
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Agent Context</h3>
          <dl className="mt-2 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-600">Agent</dt>
              <dd className="font-medium text-gray-800">{agentName ?? "Unassigned"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Call Type</dt>
              <dd className="font-medium text-gray-800">Inbound</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-600">Status</dt>
              <dd className="font-medium text-gray-800">{callStatus}</dd>
            </div>
          </dl>
        </div>
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
              <dd className="flex items-baseline gap-2 text-sm text-gray-900">
                <span>{call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}</span>
                {durationDescriptor && (
                  <span className="text-xs text-gray-500">({durationDescriptor})</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-600">Cost</dt>
              <dd className="flex items-baseline gap-2 text-sm text-gray-900">
                <span>{formatMoney(call.cost_usd)}</span>
                {costDescriptor && (
                  <span className="text-xs text-gray-500">({costDescriptor})</span>
                )}
              </dd>
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

      <div className="mt-6">
        <div className="rounded-md border bg-gray-50 p-4">
          <h2 className="text-base font-semibold leading-6 text-gray-900">Call Summary</h2>
          <div className="mt-3">
            {callSummary.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {callSummary.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No summary available for this call.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-md border bg-white p-4">
          <h2 className="text-base font-semibold leading-6 text-gray-900">Call Timeline</h2>
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-sm text-gray-800">Call Started</span>
              </div>
              <div className="text-right text-sm text-gray-500 tabular-nums">
                <time>{formatDate(call.started_at)}</time>
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-sm text-gray-800">Conversation</span>
              </div>
              <div className="text-right text-sm text-gray-500 tabular-nums">
                {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
              </div>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-3 items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    call.ended_at ? "bg-green-500" : "bg-gray-200"
                  }`}
                >
                  <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                <span className="text-sm text-gray-800">Call Ended</span>
              </div>
              <div className="text-right text-sm text-gray-500 tabular-nums">
                {call.ended_at ? <time>{formatDate(call.ended_at)}</time> : <span>In progress</span>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="rounded-md border bg-white p-4">
          <h2 className="text-base font-semibold leading-6 text-gray-900">Call Outcome Insights</h2>
          <div className="mt-3">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {callInsights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {parsedTranscript.length > 0 && (
        <div className="mt-6">
          <div className="rounded-md border bg-white p-4">
            <h2 className="text-base font-semibold leading-6 text-gray-900">Conversation Timeline</h2>
            <div className="mt-4 space-y-6">
              {parsedTranscript.map((segment, index) => (
                <div key={index} className="relative flex gap-x-3">
                  <div className="flex-none text-sm font-semibold leading-6 text-gray-500">
                    {segment.speaker === "AI" ? "Agent" : "Caller"}
                  </div>
                  <div className="flex-auto rounded-md p-3 ring-1 ring-inset ring-gray-200">
                    <div className="text-sm leading-6 text-gray-700">
                      <p className="whitespace-pre-wrap">{segment.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3 lg:grid-cols-1">
        <div className="rounded-md border bg-white p-4">
          <h2 className="text-sm font-semibold">Transcript</h2>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-gray-50 p-3 text-xs text-gray-800 font-mono">
            {call.transcript ?? "—"}
          </pre>
        </div>
      </div>

      <div className="mt-6">
        <details className="group rounded-lg border bg-white p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold text-gray-900 group-open:mb-4">
            Audit & Metadata
          </summary>
          <div className="grid grid-cols-1 gap-x-4 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-gray-600">Call ID</dt>
              <dd className="font-mono text-gray-800">{call.id}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Provider Call ID</dt>
              <dd className="font-mono text-gray-800">{call.vapi_call_id ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Agent</dt>
              <dd className="text-gray-800">{agentName ?? call.agent_id ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Direction</dt>
              <dd className="text-gray-800">Inbound</dd>
            </div>
            <div>
              <dt className="text-gray-600">From</dt>
              <dd className="font-mono text-gray-800">{maskPhoneNumber(fromNumber)}</dd>
            </div>
            <div>
              <dt className="text-gray-600">To</dt>
              <dd className="font-mono text-gray-800">{maskPhoneNumber(toNumber)}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Started</dt>
              <dd className="text-gray-800">{formatDate(call.started_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Ended</dt>
              <dd className="text-gray-800">{formatDate(call.ended_at)}</dd>
            </div>
            <div>
              <dt className="text-gray-600">Cost (Raw)</dt>
              <dd className="font-mono text-gray-800">{formatMoneyRaw(call.cost_usd)}</dd>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
