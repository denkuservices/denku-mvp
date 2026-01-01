import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LeadStatus = "new" | "contacted" | "qualified" | "unqualified";

type LeadRow = {
  id: string;
  org_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type CallRow = {
  id: string;
  started_at: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
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

function formatPhone(input?: string | null) {
  if (!input) return "—";
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

function safeStatus(s: string): LeadStatus {
  const v = (s || "").toLowerCase();
  if (v === "new" || v === "contacted" || v === "qualified" || v === "unqualified") return v;
  return "new";
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

async function getLead(orgId: string, leadId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id,org_id,name,phone,email,source,status,notes,created_at,updated_at")
    .eq("org_id", orgId)
    .eq("id", leadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as LeadRow | null;
}

async function getCallsByLeadId(orgId: string, leadId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calls")
    .select("id,started_at,outcome,duration_seconds,cost_usd")
    .eq("org_id", orgId)
    .eq("lead_id", leadId)
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data ?? []) as CallRow[];
}

export default async function Page({ params }: { params: { leadId: string } }) {
  const leadId = params.leadId;

  try {
    const orgId = await resolveOrgId();
    const lead = await getLead(orgId, leadId);

    if (!lead) {
      return (
        <div className="p-6 space-y-2">
          <h1 className="text-2xl font-semibold">Lead not found</h1>
          <p className="text-sm text-muted-foreground">This lead does not exist or you do not have access.</p>
          <Link href="/dashboard/leads" className="text-sm underline">
            Back to Leads
          </Link>
        </div>
      );
    }

    const calls = await getCallsByLeadId(orgId, leadId);

    const totalCalls = calls.length;
    const totalCost = calls.reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
    const avgDuration =
      totalCalls === 0
        ? 0
        : Math.round(calls.reduce((sum, c) => sum + Number(c.duration_seconds ?? 0), 0) / totalCalls);

    const st = safeStatus(lead.status);

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
              <h1 className="text-2xl font-semibold tracking-tight">{lead.name || lead.id}</h1>
            </div>
            <p className="text-sm text-muted-foreground">Lead profile and related call activity.</p>
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
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="text-sm">{lead.email || "—"}</p>
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
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="text-sm">{lead.source || "—"}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm text-muted-foreground">{formatDate(lead.created_at)}</p>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Last activity</p>
                <p className="text-sm text-muted-foreground">{formatDate(lead.updated_at)}</p>
              </div>

              <div className="space-y-1 md:col-span-2">
                <p className="text-xs text-muted-foreground">Lead ID</p>
                <p className="text-sm font-mono text-muted-foreground break-all">{lead.id}</p>
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="rounded-xl border bg-white p-4 space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Calls</p>
              <p className="mt-1 text-2xl font-semibold">{totalCalls}</p>
              <p className="mt-1 text-xs text-muted-foreground">Related to this lead</p>
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
              <p className="mt-1 text-sm text-muted-foreground">
                Once calls are linked to this lead (calls.lead_id), they will appear here.
              </p>
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
                      <td className="px-4 py-3">{c.outcome || "—"}</td>
                      <td className="px-4 py-3">{formatDuration(Number(c.duration_seconds ?? 0))}</td>
                      <td className="px-4 py-3">{formatUSD(Number(c.cost_usd ?? 0))}</td>
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
      </div>
    );
  } catch (err: any) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Application error</h1>
        <p className="text-sm text-muted-foreground">{err?.message ?? "Unexpected error"}</p>
        <Link href="/dashboard/leads" className="text-sm underline">
          Back to Leads
        </Link>
      </div>
    );
  }
}
