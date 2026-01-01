import Link from "next/link";

type TicketStatus = "open" | "in_progress" | "closed";
type TicketPriority = "low" | "medium" | "high";

type TicketRow = {
  id: string;
  summary: string;
  status: TicketStatus;
  priority: TicketPriority;
  updated_at: string; // ISO
  linked_lead_id?: string | null;
  linked_call_id?: string | null;
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

function statusLabel(s: TicketStatus) {
  switch (s) {
    case "open":
      return "Open";
    case "in_progress":
      return "In progress";
    case "closed":
      return "Closed";
  }
}

function statusBadgeClass(s: TicketStatus) {
  switch (s) {
    case "open":
      return "bg-zinc-900 text-white";
    case "in_progress":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "closed":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

function priorityLabel(p: TicketPriority) {
  switch (p) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
  }
}

function priorityBadgeClass(p: TicketPriority) {
  switch (p) {
    case "high":
      return "bg-zinc-900 text-white";
    case "medium":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200";
    case "low":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200";
  }
}

function getMockTickets(): TicketRow[] {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();

  return [
    {
      id: "tkt_001",
      summary: "Customer asked to reschedule appointment; confirm availability.",
      status: "open",
      priority: "high",
      updated_at: hours(2),
      linked_lead_id: "lead_002",
      linked_call_id: "call_9f2a",
    },
    {
      id: "tkt_002",
      summary: "Follow up with lead regarding pricing details.",
      status: "in_progress",
      priority: "medium",
      updated_at: hours(10),
      linked_lead_id: "lead_003",
      linked_call_id: null,
    },
    {
      id: "tkt_003",
      summary: "Incorrect contact number; request updated phone.",
      status: "closed",
      priority: "low",
      updated_at: hours(36),
      linked_lead_id: "lead_005",
      linked_call_id: null,
    },
  ];
}

export default function Page({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = asString(searchParams?.q).trim();
  const status = asString(searchParams?.status).trim() as TicketStatus | "";
  const priority = asString(searchParams?.priority).trim() as TicketPriority | "";

  const all = getMockTickets();

  const filtered = all.filter((row) => {
    const qOk = !q || row.summary.toLowerCase().includes(q.toLowerCase()) || row.id.toLowerCase().includes(q.toLowerCase());
    const statusOk = !status || row.status === status;
    const priorityOk = !priority || row.priority === priority;
    return qOk && statusOk && priorityOk;
  });

  const openCount = all.filter((t) => t.status === "open").length;
  const highCount = all.filter((t) => t.priority === "high" && t.status !== "closed").length;
  const closedCount = all.filter((t) => t.status === "closed").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            Operational follow-ups and escalations created from calls and lead activity.
          </p>
        </div>

        <button
          type="button"
          disabled
          className="inline-flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60"
          title="Coming soon"
        >
          Create ticket
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Open</p>
          <p className="mt-1 text-2xl font-semibold">{openCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Requires attention</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">High priority</p>
          <p className="mt-1 text-2xl font-semibold">{highCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Open or in progress</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-muted-foreground">Closed</p>
          <p className="mt-1 text-2xl font-semibold">{closedCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">Resolved</p>
        </div>
      </div>

      {/* Controls */}
      <form className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1 space-y-2">
          <label className="text-sm font-medium">Search</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Ticket ID or summary…"
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
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="w-full md:w-56 space-y-2">
          <label className="text-sm font-medium">Priority</label>
          <select
            name="priority"
            defaultValue={priority}
            className="w-full rounded-md border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-200"
          >
            <option value="">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
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
            href="/dashboard/tickets"
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
            {filtered.length} of {all.length} tickets
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No tickets found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Summary</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Updated</th>
                  <th className="px-4 py-3 font-medium">Linked</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{row.summary}</div>
                      <div className="text-xs text-muted-foreground">ID: {row.id}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${priorityBadgeClass(
                          row.priority
                        )}`}
                      >
                        {priorityLabel(row.priority)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(row.updated_at)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <div>{row.linked_lead_id ? `Lead: ${row.linked_lead_id}` : "Lead: —"}</div>
                      <div>{row.linked_call_id ? `Call: ${row.linked_call_id}` : "Call: —"}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/tickets/${row.id}`}
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
        Note: This page is currently using mock data. Replace <span className="font-mono">getMockTickets()</span> with a
        Supabase query once the schema is finalized.
      </p>
    </div>
  );
}
