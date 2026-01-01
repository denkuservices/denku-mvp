import Link from "next/link";

type TicketStatus = "open" | "in_progress" | "closed";
type TicketPriority = "low" | "medium" | "high";

type TicketRow = {
  id: string;
  summary: string;
  status: TicketStatus;
  priority: TicketPriority;
  created_at: string; // ISO
  updated_at: string; // ISO
  linked_lead_id?: string | null;
  linked_call_id?: string | null;
  description?: string | null;
};

type ActivityItem = {
  id: string;
  at: string; // ISO
  text: string;
};

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

function getMockTicketById(ticketId: string): TicketRow {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();

  const known: TicketRow[] = [
    {
      id: "tkt_001",
      summary: "Customer asked to reschedule appointment; confirm availability.",
      status: "open",
      priority: "high",
      created_at: hours(28),
      updated_at: hours(2),
      linked_lead_id: "lead_002",
      linked_call_id: "call_9f2a",
      description:
        "Lead requested a reschedule. Confirm next available slots and follow up via SMS or email once confirmed.",
    },
    {
      id: "tkt_002",
      summary: "Follow up with lead regarding pricing details.",
      status: "in_progress",
      priority: "medium",
      created_at: hours(52),
      updated_at: hours(10),
      linked_lead_id: "lead_003",
      linked_call_id: null,
      description: "Prepare pricing breakdown and send to the lead. Capture objections.",
    },
    {
      id: "tkt_003",
      summary: "Incorrect contact number; request updated phone.",
      status: "closed",
      priority: "low",
      created_at: hours(90),
      updated_at: hours(36),
      linked_lead_id: "lead_005",
      linked_call_id: null,
      description: "The number appears invalid. Request updated contact details and re-attempt outreach.",
    },
  ];

  return (
    known.find((t) => t.id === ticketId) ?? {
      id: ticketId,
      summary: "Unknown ticket",
      status: "open",
      priority: "low",
      created_at: hours(1),
      updated_at: hours(0),
      linked_lead_id: null,
      linked_call_id: null,
      description: null,
    }
  );
}

function getMockActivity(ticketId: string): ActivityItem[] {
  const now = Date.now();
  const hours = (n: number) => new Date(now - n * 60 * 60 * 1000).toISOString();

  // Small deterministic variation
  const seed = ticketId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const base: ActivityItem[] = [
    { id: "act_001", at: hours(24), text: "Ticket created from call review." },
    { id: "act_002", at: hours(12), text: "Assigned to operations queue." },
    { id: "act_003", at: hours(2), text: "Attempted outreach; awaiting response." },
  ];

  if (seed % 3 === 0) return base.slice(0, 2);
  return base;
}

export default function Page({ params }: { params: { ticketId: string } }) {
  const ticket = getMockTicketById(params.ticketId);
  const activity = getMockActivity(params.ticketId);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/tickets" className="text-sm text-muted-foreground hover:underline">
              Tickets
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <h1 className="text-2xl font-semibold tracking-tight">{ticket.id}</h1>
          </div>
          <p className="text-sm text-muted-foreground">Ticket detail, status, and activity history.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 opacity-60"
            title="Coming soon"
          >
            Add update
          </button>
          <button
            type="button"
            disabled
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white opacity-60"
            title="Coming soon"
          >
            Change status
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm font-medium">Summary</p>
          <p className="mt-2 text-sm">{ticket.summary}</p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Priority</p>
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${priorityBadgeClass(
                  ticket.priority
                )}`}
              >
                {priorityLabel(ticket.priority)}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                  ticket.status
                )}`}
              >
                {statusLabel(ticket.status)}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Created</p>
              <p className="text-sm text-muted-foreground">{formatDate(ticket.created_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Last updated</p>
              <p className="text-sm text-muted-foreground">{formatDate(ticket.updated_at)}</p>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked lead</p>
              {ticket.linked_lead_id ? (
                <Link className="text-sm underline" href={`/dashboard/leads/${ticket.linked_lead_id}`}>
                  {ticket.linked_lead_id}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Linked call</p>
              {ticket.linked_call_id ? (
                <Link className="text-sm underline" href={`/dashboard/calls/${ticket.linked_call_id}`}>
                  {ticket.linked_call_id}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <p className="text-sm font-medium">Description</p>
          {ticket.description ? (
            <p className="text-sm text-muted-foreground">{ticket.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </div>
      </div>

      {/* Activity */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Activity</p>
          <p className="text-xs text-muted-foreground">A lightweight audit trail of ticket updates.</p>
        </div>

        {activity.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No activity yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Updates will appear here.</p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {activity.map((a) => (
              <div key={a.id} className="rounded-lg border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">{a.text}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(a.at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: This page is currently using mock data. Replace the mock getters with Supabase queries once the schema is finalized.
      </p>
    </div>
  );
}
