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
};

function asString(v: string | string[] | undefined) {
  if (!v) return "";
  return Array.isArray(v) ? v[0] : v;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatPhone(input: string) {
  // Very lightweight formatting for demo. Keep raw in DB later.
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
  // Neutral, product-console style (no custom colors required).
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
 * Mock dataset for MVP UI.
 * Replace later with Supabase query:
 * - filter by org_id
 * - order by created_at desc
 * - apply q + status in SQL
 */
function getMockLeads(): LeadRow[] {
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: "lead_001",
      name: "Alex Johnson",
      phone: "+1 407 555 0139",
      status: "new",
      source: "inbound_call",
      created_at: days(1),
      last_contacted_at: null,
    },
    {
      id: "lead_002",
      name: "Maria Garcia",
      phone: "+1 321 555 0194",
      status: "contacted",
      source: "web",
      created_at: days(3),
      last_contacted_at: days(2),
    },
    {
      id: "lead_003",
      name: "Kevin Patel",
      phone: "+1 689 555 0144",
      status: "qualified",
      source: "referral",
      created_at: days(6),
      last_contacted_at: days(1),
    },
    {
      id: "lead_004",
      name: "Samantha Lee",
      phone: "+1 407 555 0108",
      status: "unqualified",
      source: "web",
      created_at: days(12),
      last_contacted_at: days(10),
    },
    {
      id: "lead_005",
      name: "Noah Brown",
      phone: "+1 561 555 0151",
      status: "contacted",
      source: "import",
      created_at: days(18),
      last_contacted_at: null,
    },
  ];
}

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = asString(searchParams?.q).trim();
  const status = asString(searchParams?.status).trim() as LeadStatus | "";

  const all = getMockLeads();

  const filtered = all.filter((row) => {
    const qOk =
      !q ||
      row.name.toLowerCase().includes(q.toLowerCase()) ||
      row.phone.replace(/\s/g, "").includes(q.replace(/\s/g, ""));
    const statusOk = !status || row.status === status;
    return qOk && statusOk;
  });

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const totalLeads = all.length;

  const new7d = all.filter((l) => {
    const t = new Date(l.created_at).getTime();
    return !Number.isNaN(t) && t >= sevenDaysAgo;
  }).length;

  const contactedCount = all.filter((l) => l.status === "contacted" || l.status === "qualified").length;
  const contactRate = totalLeads === 0 ? 0 : Math.round((contactedCount / totalLeads) * 100);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Manage inbound prospects and track progression through your pipeline.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60"
          title="Coming soon"
        >
          Create lead
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Total leads</p>
          <p className="mt-1 text-2xl font-semibold">{totalLeads}</p>
          <p className="mt-1 text-xs text-muted-foreground">All time</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">New</p>
          <p className="mt-1 text-2xl font-semibold">{new7d}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last 7 days</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Contact rate</p>
          <p className="mt-1 text-2xl font-semibold">{contactRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">Contacted + Qualified</p>
        </div>
      </div>

      {/* Controls */}
      <form className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">Search</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Name or phone…"
            className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        <div className="w-full md:w-56 space-y-2">
          <label className="text-sm font-medium">Status</label>
          <select
            name="status"
            defaultValue={status}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="unqualified">Unqualified</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Apply
          </button>
          <Link
            href="/dashboard/leads"
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            title="Clear filters"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Table */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Results</p>
          <p className="text-xs text-muted-foreground">
            {filtered.length} of {all.length} leads
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No leads found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Last contacted</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-xs text-muted-foreground">ID: {row.id}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs md:text-sm">{formatPhone(row.phone)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">{sourceLabel(row.source)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(row.last_contacted_at ?? null)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/leads/${row.id}`}
                        className="rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
                      >
                        View
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
        Note: This page is currently using mock data. Replace <span className="font-mono">getMockLeads()</span> with a
        Supabase query once the schema is finalized.
      </p>
    </div>
  );
}
