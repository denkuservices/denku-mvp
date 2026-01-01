import Link from "next/link";

type LeadStatus = "new" | "contacted" | "qualified" | "unqualified";

type LeadRow = {
  id: string;
  name: string;
  phone: string;
  status: LeadStatus;
  source: "web" | "inbound_call" | "referral" | "import";
  created_at: string; // ISO
  last_contacted_at?: string | null; // ISO
  notes?: string | null;
};

type CallRow = {
  id: string;
  started_at: string;
  duration_seconds: number;
  cost_usd: number;
  outcome: "completed" | "no_answer" | "failed" | "voicemail";
};


function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatUSD(value: number) {
  return `$${value.toFixed(4)}`;
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${r}s`;
}

function formatPhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const a = digits.slice(1, 4);
    const b = digits.slice(4, 7);
    const c = digits.slice(7);
    return `+1 (${a}) ${b}-${c}`;
  }
  if (digits.length === 10) {
    const a = digits.slice(0, 3);
    const b = digits.slice(3, 6);
    const c = digits.slice(6);
    return `(${a}) ${b}-${c}`;
  }
  return input;
}

function statusLabel(s: LeadStatus) {
  switch (s) {
    case "new":
      return "New";
    case "contacted":
      return "Contacted";
    case "qualified":
      return "Qualified";
    case "unqualified":
      return "Unqualified";
  }
}

function statusBadgeClass(s: LeadStatus) {
  switch (s) {
    case "new":
      return "bg-zinc-900 text-white";
    case "contacted":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "qualified":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "unqualified":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

function sourceLabel(s: LeadRow["source"]) {
  switch (s) {
    case "web":
      return "Web";
    case "inbound_call":
      return "Inbound call";
    case "referral":
      return "Referral";
    case "import":
      return "Import";
  }
}

/**
 * NOTE:
 * These mock getters intentionally mirror the list page.
 * Later replace with:
 * - SELECT lead by id
 * - SELECT calls WHERE lead_id = :id OR phone match
 */
function getMockLeadById(leadId: string): LeadRow {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

  const fallback: LeadRow = {
    id: leadId,
    name: "Unknown lead",
    phone: "+1 000 000 0000",
    status: "new",
    source: "web",
    created_at: days(0),
    last_contacted_at: null,
    notes: null,
  };

  const known: LeadRow[] = [
    {
      id: "lead_001",
      name: "Alex Johnson",
      phone: "+1 407 555 0139",
      status: "new",
      source: "inbound_call",
      created_at: days(1),
      last_contacted_at: null,
      notes: "Inbound call. Requested a demo next week.",
    },
    {
      id: "lead_002",
      name: "Maria Garcia",
      phone: "+1 321 555 0194",
      status: "contacted",
      source: "web",
      created_at: days(3),
      last_contacted_at: days(2),
      notes: "Asked about pricing and Spanish language support.",
    },
    {
      id: "lead_003",
      name: "Kevin Patel",
      phone: "+1 689 555 0144",
      status: "qualified",
      source: "referral",
      created_at: days(6),
      last_contacted_at: days(1),
      notes: "Strong fit. Wants to go live after onboarding.",
    },
    {
      id: "lead_004",
      name: "Samantha Lee",
      phone: "+1 407 555 0108",
      status: "unqualified",
      source: "web",
      created_at: days(12),
      last_contacted_at: days(10),
      notes: "Not a fit right now. Budget constraints.",
    },
    {
      id: "lead_005",
      name: "Noah Brown",
      phone: "+1 561 555 0151",
      status: "contacted",
      source: "import",
      created_at: days(18),
      last_contacted_at: null,
      notes: "Imported list. Needs first outreach.",
    },
  ];

  return known.find((l) => l.id === leadId) ?? fallback;
}

function getMockCallsForLead(leadId: string): CallRow[] {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();

  // Basic deterministic variety by leadId (so different leads look different)
  const seed = leadId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const pick = <T,>(arr: T[]) => arr[seed % arr.length];

  const outcomes: CallRow["outcome"][] = ["completed", "no_answer", "failed", "voicemail"];
  const baseOutcome = pick(outcomes);

  // Provide a few calls; adjust per lead.
  const base: CallRow[] = [
    { id: "call_a1", started_at: hours(6), duration_seconds: 182, cost_usd: 0.0132, outcome: "completed" },
    { id: "call_a2", started_at: hours(30), duration_seconds: 42, cost_usd: 0.0041, outcome: baseOutcome },
    { id: "call_a3", started_at: hours(52), duration_seconds: 305, cost_usd: 0.0218, outcome: "completed" },
  ];

  if (leadId === "lead_001") return base.slice(0, 1);
  if (leadId === "lead_004") return base.slice(0, 2).map((c) => ({ ...c, outcome: "no_answer" }));
  return base;
}

function outcomeLabel(o: CallRow["outcome"]) {
  switch (o) {
    case "completed":
      return "Completed";
    case "no_answer":
      return "No answer";
    case "failed":
      return "Failed";
    case "voicemail":
      return "Voicemail";
  }
}

function outcomeBadgeClass(o: CallRow["outcome"]) {
  switch (o) {
    case "completed":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "no_answer":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
    case "failed":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
    case "voicemail":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

export default function Page({ params }: { params: { leadId: string } }) {
  const lead = getMockLeadById(params.leadId);
  const calls = getMockCallsForLead(params.leadId);

  const totalCalls = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + c.cost_usd, 0);
  const avgDuration =
    totalCalls === 0 ? 0 : Math.round(calls.reduce((sum, c) => sum + c.duration_seconds, 0) / totalCalls);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/leads" className="text-sm text-muted-foreground hover:underline">
              Leads
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Lead profile and related call activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 opacity-60"
            title="Coming soon"
          >
            Add note
          </button>
          <button
            type="button"
            disabled
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60"
            title="Coming soon"
          >
            Update status
          </button>
        </div>
      </div>

      {/* Lead summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm font-medium">Lead</p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-mono text-sm">{formatPhone(lead.phone)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                  lead.status
                )}`}
              >
                {statusLabel(lead.status)}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Source</p>
              <p className="text-sm">{sourceLabel(lead.source)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm text-muted-foreground">{formatDate(lead.created_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last contacted</p>
              <p className="text-sm text-muted-foreground">{formatDate(lead.last_contacted_at ?? null)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Lead ID</p>
              <p className="text-sm font-mono text-muted-foreground">{lead.id}</p>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">Calls</p>
            <p className="mt-1 text-2xl font-semibold">{totalCalls}</p>
            <p className="mt-1 text-xs text-muted-foreground">All time</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg duration</p>
            <p className="mt-1 text-2xl font-semibold">{formatDuration(avgDuration)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Across related calls</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total cost</p>
            <p className="mt-1 text-2xl font-semibold">{formatUSD(totalCost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Estimated</p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Notes</p>
          <p className="text-xs text-muted-foreground">Internal notes for your team.</p>
        </div>
        <div className="p-4">
          {lead.notes ? (
            <p className="text-sm">{lead.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          )}
        </div>
      </div>

      {/* Related calls */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Related calls</p>
          <p className="text-xs text-muted-foreground">Calls associated with this lead.</p>
        </div>

        {calls.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No calls yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Once the lead interacts with an agent, calls will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(c.started_at)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${outcomeBadgeClass(
                          c.outcome
                        )}`}
                      >
                        {outcomeLabel(c.outcome)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatDuration(c.duration_seconds)}</td>
                    <td className="px-4 py-3">{formatUSD(c.cost_usd)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/calls/${c.id}`}
                        className="rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                      >
                        View call
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: This page is currently using mock data. Replace the mock getters with Supabase queries once the schema is finalized.
      </p>
    </div>
  );
}
