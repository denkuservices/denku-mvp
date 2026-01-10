// web/src/app/(app)/dashboard/calls/[callId]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CollapsibleAuditMetadata } from "./CollapsibleAuditMetadata";

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
  raw_payload: string | null; // DB'de text
  created_at: string | null;
  from_phone: string | null;
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
      "id, vapi_call_id, org_id, agent_id, started_at, ended_at, duration_seconds, cost_usd, outcome, transcript, raw_payload, created_at, from_phone"
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

      <div className="mt-4 grid w-full grid-cols-1 gap-5 xl:grid-cols-2 items-stretch">
        <div className="!z-5 relative flex h-full flex-col w-full min-w-0 rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Agent Context</h2>
          </div>
          <div className="mt-4 flex-1 overflow-x-auto px-6 pb-6 min-w-0">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Agent</td>
                  <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{agentName ?? "Unassigned"}</td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Caller</td>
                  <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{call.from_phone ? maskPhoneNumber(call.from_phone) : "—"}</td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Call Type</td>
                  <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">Inbound</td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Status</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      callStatus === "Completed"
                        ? "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200"
                        : callStatus === "In progress"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    }`}>
                      {callStatus}
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Outcome</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
                      {outcome || "—"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="!z-5 relative flex h-full flex-col w-full min-w-0 rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">KPIs</h2>
          </div>
          <div className="mt-4 flex-1 grid grid-cols-1 gap-4 px-6 pb-6 sm:grid-cols-2 min-w-0">
            <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Started</p>
              <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">{formatDate(call.started_at)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Ended</p>
              <p className="mt-1 text-sm font-bold text-navy-700 dark:text-white">{formatDate(call.ended_at)}</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Duration</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-sm font-bold text-navy-700 dark:text-white">{call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}</span>
                {durationDescriptor && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">({durationDescriptor})</span>
                )}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Cost</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-sm font-bold text-navy-700 dark:text-white">{formatMoney(call.cost_usd)}</span>
                {costDescriptor && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">({costDescriptor})</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="!z-5 relative flex h-full flex-col w-full min-w-0 rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Recording</h2>
          </div>
          {recordingUrl ? (
            <div className="mt-4 flex-1 px-6 pb-6 flex items-center min-w-0">
              <div className="w-full rounded-xl border border-gray-200 dark:border-white/20 bg-gray-50 dark:bg-navy-700 p-4">
                <audio controls className="h-14 w-full">
                  <source src={recordingUrl} />
                </audio>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex-1 px-6 pb-6 flex items-center min-w-0">
              <p className="text-sm text-gray-600 dark:text-gray-400">No recording available</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Call Summary</h2>
          </div>
          <div className="mt-4 overflow-x-auto px-6 pb-6">
            {callSummary.length > 0 ? (
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                  {callSummary.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                      <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{item}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No summary available for this call.</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Call Timeline</h2>
          </div>
          <div className="mt-4 overflow-x-auto px-6 pb-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/20">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Event</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 dark:text-white">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3">
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
                      <span className="text-sm font-bold text-navy-700 dark:text-white">Call Started</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    <time>{formatDate(call.started_at)}</time>
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-6 w-6 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0">
                        <svg className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <span className="text-sm font-bold text-navy-700 dark:text-white">Conversation</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {call.duration_seconds != null ? `${call.duration_seconds}s` : "—"}
                  </td>
                </tr>
                <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 ${call.ended_at ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"}`}>
                        <svg className={`h-4 w-4 ${call.ended_at ? "text-white" : "text-gray-500 dark:text-gray-400"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                      <span className="text-sm font-bold text-navy-700 dark:text-white">Call Ended</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                    {call.ended_at ? <time>{formatDate(call.ended_at)}</time> : <span>In progress</span>}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Call Outcome Insights</h2>
          </div>
          <div className="mt-4 overflow-x-auto px-6 pb-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/20">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Metric</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {callInsights.map((insight, index) => {
                  // Extract key-value pairs if format is "Key: Value", otherwise treat as value only
                  const parts = insight.split(/:\s+/);
                  const metric = parts.length > 1 ? parts[0] : "Insight";
                  const value = parts.length > 1 ? parts.slice(1).join(": ") : insight;

                  // Determine if value represents a status (for badge styling)
                  const isStatus = value.toLowerCase().includes("completed") ||
                    value.toLowerCase().includes("scheduled") ||
                    value.toLowerCase().includes("failed") ||
                    value.toLowerCase().includes("ended");

                  return (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">
                        {metric}
                      </td>
                      <td className="px-4 py-3">
                        {isStatus ? (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              value.toLowerCase().includes("completed") || value.toLowerCase().includes("scheduled")
                                ? "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200"
                                : value.toLowerCase().includes("failed") || value.toLowerCase().includes("ended")
                                ? "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-200"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200"
                            }`}
                          >
                            {value}
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-navy-700 dark:text-white">{value}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {parsedTranscript.length > 0 && (
        <div className="mt-6">
          <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
            <div className="flex items-center justify-between px-6 pt-6">
              <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Conversation Timeline</h2>
            </div>
            <div className="mt-4 overflow-x-auto px-6 pb-6">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/20">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Speaker</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Message</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 dark:text-white">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                  {parsedTranscript.map((segment, index) => (
                    <tr key={index} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            segment.speaker === "AI"
                              ? "bg-brand-100 text-brand-800 dark:bg-brand-700 dark:text-brand-200"
                              : segment.speaker === "User"
                              ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                              : "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200"
                          }`}
                        >
                          {segment.speaker === "AI" ? "Agent" : segment.speaker === "User" ? "Caller" : "System"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700 dark:text-white">
                          <p className="whitespace-pre-wrap">{segment.text}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 dark:text-gray-400">
                        {/* Timestamp would be parsed from transcript if available */}
                        —
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6">
        <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Transcript</h2>
          </div>
          <div className="mt-4 overflow-x-auto px-6 pb-6">
            {call.transcript ? (
              <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
                <pre className="whitespace-pre-wrap break-words text-xs text-gray-800 dark:text-gray-200 font-mono">
                  {call.transcript}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No transcript available</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6">
        <CollapsibleAuditMetadata
          rows={[
            { field: "Call ID", value: <span className="font-mono">{call.id}</span> },
            { field: "Provider Call ID", value: <span className="font-mono">{call.vapi_call_id ?? "—"}</span> },
            { field: "Agent", value: agentName ?? call.agent_id ?? "Unassigned" },
            { field: "Direction", value: "Inbound" },
            { field: "From", value: <span className="font-mono">{maskPhoneNumber(fromNumber)}</span> },
            { field: "To", value: <span className="font-mono">{maskPhoneNumber(toNumber)}</span> },
            { field: "Started", value: formatDate(call.started_at) },
            { field: "Ended", value: formatDate(call.ended_at) },
            { field: "Cost (Raw)", value: <span className="font-mono">{formatMoneyRaw(call.cost_usd)}</span> },
          ]}
        />
      </div>
    </div>
  );
}
