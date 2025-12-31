export const runtime = "nodejs";

import Link from "next/link";

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
      <h1 className="text-2xl font-semibold">Call Detail</h1>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Started</div>
          <div className="font-medium">
            {call.started_at
              ? new Date(call.started_at).toLocaleString()
              : "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Ended</div>
          <div className="font-medium">
            {call.ended_at ? new Date(call.ended_at).toLocaleString() : "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Duration (sec)</div>
          <div className="text-xl font-bold">
            {call.duration_seconds ?? "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="text-xl font-bold">
            {call.cost_usd ? `$${call.cost_usd.toFixed(4)}` : "-"}
          </div>
        </div>
      </div>

      {/* OUTCOME */}
      <div className="border rounded p-4">
        <div className="text-sm text-muted-foreground mb-1">Outcome</div>
        <div className="font-medium">{call.outcome ?? "-"}</div>
      </div>

      {/* TRANSCRIPT */}
      <div className="border rounded p-4">
        <div className="text-sm text-muted-foreground mb-2">Transcript</div>

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

        <pre className="mt-3 text-xs overflow-auto bg-muted p-3 rounded">
          {JSON.stringify(call.raw_payload, null, 2)}
        </pre>
      </details>

      {/* BACK LINK */}
      <Link
        href={`/dashboard/agents/${call.agent_id}`}
        className="inline-block text-sm text-muted-foreground hover:underline"
      >
        ← Back to Agent
      </Link>
    </div>
  );
}
