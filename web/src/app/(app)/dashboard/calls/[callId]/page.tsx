import Link from "next/link";

export const dynamic = "force-dynamic";

type CallDetail = {
  id: string;
  vapi_call_id?: string | null;
  agent_id?: string | null;
  lead_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  duration_sec?: number | null;
  cost_usd?: number | null;
  status?: string | null;
  outcome?: string | null;
  transcript?: string | null;
  raw?: unknown;
};

function toBasicAuthHeader() {
  const user = process.env.ADMIN_USER ?? "";
  const pass = process.env.ADMIN_PASS ?? "";
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

async function adminGetJSON<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatMoney(n?: number | null) {
  if (n === null || n === undefined) return "—";
  return `$${n.toFixed(4)}`;
}

export default async function CallDetailPage({
  params,
}: {
  params: { callId: string };
}) {
  const { callId } = params;

  const call = await adminGetJSON<CallDetail>(`/api/admin/calls/${callId}`);

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
        </div>

        <div className="flex items-center gap-2">
          {call.agent_id ? (
            <Link
              href={`/dashboard/agents/${call.agent_id}`}
              className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Back to Agent
            </Link>
          ) : null}

          <Link
            href="/dashboard/agents"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Back to Agents
          </Link>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
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
                {call.duration_sec !== null && call.duration_sec !== undefined
                  ? `${call.duration_sec}s`
                  : "—"}
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
            {call.raw ? JSON.stringify(call.raw, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}
