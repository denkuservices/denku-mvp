export const runtime = "nodejs";

import Link from "next/link";
type TranscriptItem = { speaker?: string; text?: string };

function TranscriptView({ transcript }: { transcript: any }) {
  if (Array.isArray(transcript)) {
    return (
      <div className="space-y-2">
        {transcript.map((t: TranscriptItem, i: number) => {
          const isAgent = t.speaker === "agent";
          return (
            <div
              key={i}
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                isAgent
                  ? "ml-auto bg-blue-50 border border-blue-200"
                  : "mr-auto bg-green-50 border border-green-200"
              }`}
            >
              <div className="text-xs mb-1 opacity-70">
                {isAgent ? "Agent" : "Customer"}
              </div>
              <div>{t.text}</div>
            </div>
          );
        })}
      </div>
    );
  }

  if (typeof transcript === "string") {
    return <pre className="text-sm whitespace-pre-wrap">{transcript}</pre>;
  }

  return (
    <p className="text-sm text-muted-foreground">
      No transcript available.
    </p>
  );
}

type CallDetail = {
  id: string;
  agent_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  outcome: string | null;
  transcript: string | null;
  raw_payload: any;
};

async function getCall(callId: string): Promise<CallDetail> {
  const user = process.env.ADMIN_USER!;
  const pass = process.env.ADMIN_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/calls/${callId}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
      },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error("Failed to load call detail");
  }

  const json = await res.json();
  return json.data;
}

export default async function Page({
  params,
}: {
  params: Promise<{ callId: string }>;
}) {
  const { callId } = await params;
  const call = await getCall(callId);

  return (
    <div className="p-6 space-y-8">
      {/* BACK LINK */}
      <Link
        href={`/dashboard/agents/${call.agent_id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to Agent
      </Link>

      <h1 className="text-2xl font-semibold">Call Detail</h1>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Started</div>
          <div className="text-lg font-semibold">
            {call.started_at
              ? new Date(call.started_at).toLocaleString()
              : "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Ended</div>
          <div className="text-lg font-semibold">
            {call.ended_at ? new Date(call.ended_at).toLocaleString() : "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Duration (sec)</div>
          <div className="text-2xl font-bold">
            {call.duration_seconds ?? "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="text-2xl font-bold">
            {call.cost_usd !== null
              ? `$${Number(call.cost_usd).toFixed(4)}`
              : "-"}
          </div>
        </div>
      </div>

      {/* OUTCOME */}
      <div className="border rounded p-4">
        <div className="text-sm text-muted-foreground mb-1">Outcome</div>
        <div className="font-semibold">{call.outcome ?? "-"}</div>
      </div>

      {/* TRANSCRIPT */}
      <div className="border rounded p-4">
        <div className="text-sm text-muted-foreground mb-2">Transcript</div>
        <TranscriptView transcript={call.transcript} />
        </div>
        {call.transcript ? (
          <pre className="text-sm whitespace-pre-wrap">
            {call.transcript}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">
            No transcript available.
          </p>
        )}
      </div>

      {/* RAW PAYLOAD */}
      <details className="border rounded p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Raw Payload (debug)
        </summary>
        <pre className="mt-3 text-xs overflow-x-auto bg-muted p-3 rounded">
          {JSON.stringify(call.raw_payload, null, 2)}
        </pre>
      </details>

      {/* BACK LINK (BOTTOM) */}
      <Link
        href={`/dashboard/agents/${call.agent_id}`}
        className="text-sm text-muted-foreground hover:underline"
      >
        ← Back to Agent
      </Link>
    </div>
  );
}
