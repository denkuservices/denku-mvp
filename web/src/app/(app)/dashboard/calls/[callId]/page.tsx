export const runtime = "nodejs";

type CallDetail = {
  id: string;
  vapi_call_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
  outcome: string | null;
  transcript: string | null;
};

async function getCall(callId: string): Promise<CallDetail> {
  const user = process.env.ADMIN_USER!;
  const pass = process.env.ADMIN_PASS!;
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/admin/calls/${callId}`,
    {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    throw new Error("Failed to load call");
  }

  const json = await res.json();
  return json.data;
}

export default async function Page({
  params,
}: {
  params: { callId: string };
}) {
  const call = await getCall(params.callId);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Call Detail</h1>

      {/* META */}
      <div className="grid grid-cols-2 gap-4">
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
            {call.ended_at
              ? new Date(call.ended_at).toLocaleString()
              : "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Duration (sec)</div>
          <div className="font-bold">
            {call.duration_seconds ?? "-"}
          </div>
        </div>

        <div className="border rounded p-4">
          <div className="text-sm text-muted-foreground">Cost (USD)</div>
          <div className="font-bold">
            {call.cost_usd ? `$${call.cost_usd.toFixed(4)}` : "-"}
          </div>
        </div>
      </div>

      {/* OUTCOME */}
      <div className="border rounded p-4">
        <div className="text-sm text-muted-foreground">Outcome</div>
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
          <div className="text-sm text-muted-foreground">
            No transcript available.
          </div>
        )}
      </div>
    </div>
  );
}
