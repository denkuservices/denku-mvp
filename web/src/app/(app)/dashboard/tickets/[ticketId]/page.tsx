import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TicketStatus = "open" | "in_progress" | "closed";
type TicketPriority = "low" | "medium" | "high";

type TicketRow = {
  id: string;
  org_id: string;
  lead_id: string | null;
  subject: string;
  status: string;
  priority: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function safeStatus(s: string): TicketStatus {
  const v = (s || "").toLowerCase();
  if (v === "open" || v === "in_progress" || v === "closed") return v;
  return "open";
}

function safePriority(p: string): TicketPriority {
  const v = (p || "").toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "low";
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

async function resolveOrgId() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!auth?.user) throw new Error("Not authenticated. Please sign in to view this dashboard.");

  const profileId = auth.user.id;
  const candidates = ["org_id", "organization_id", "current_org_id", "orgs_id"] as const;

  for (const col of candidates) {
    const { data, error } = await supabase
      .from("profiles")
      .select(`${col}`)
      .eq("id", profileId)
      .maybeSingle();

    if (!error && data && (data as any)[col]) {
      return (data as any)[col] as string;
    }
  }

  throw new Error(
    "Could not resolve org_id for this user. Expected one of: profiles.org_id / organization_id / current_org_id / orgs_id."
  );
}

async function getTicket(orgId: string, ticketId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id,org_id,lead_id,subject,status,priority,description,created_at,updated_at")
    .eq("org_id", orgId)
    .eq("id", ticketId)
    .single();

  if (error) throw new Error(error.message);
  return data as TicketRow;
}

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { ticketId: string } }) {
  const orgId = await resolveOrgId();
  const ticket = await getTicket(orgId, params.ticketId);

  const st = safeStatus(ticket.status);
  const pr = safePriority(ticket.priority);

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
          <p className="text-sm text-muted-foreground">Ticket detail, status, and metadata.</p>
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
          <p className="text-sm font-medium">Subject</p>
          <p className="mt-2 text-sm">{ticket.subject}</p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Priority</p>
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${priorityBadgeClass(
                  pr
                )}`}
              >
                {priorityLabel(pr)}
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Status</p>
              <span
                className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(
                  st
                )}`}
              >
                {statusLabel(st)}
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
              {ticket.lead_id ? (
                <Link className="text-sm underline" href={`/dashboard/leads/${ticket.lead_id}`}>
                  {ticket.lead_id}
                </Link>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Ticket ID</p>
              <p className="text-sm font-mono text-muted-foreground">{ticket.id}</p>
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

      {/* Future: Activity log */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Activity</p>
          <p className="text-xs text-muted-foreground">Audit trail will be added when settings/audit is wired.</p>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">No activity entries yet.</p>
        </div>
      </div>
    </div>
  );
}
