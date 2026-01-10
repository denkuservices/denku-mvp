import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

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

function isUuid(v?: string | null) {
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function formatUSD(value: number) {
  return `$${Number(value ?? 0).toFixed(4)}`;
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(Number(sec ?? 0)));
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
      return "bg-zinc-900 text-white dark:bg-navy-700 dark:text-white";
    case "contacted":
      return "bg-zinc-100 text-zinc-900 border border-zinc-200 dark:bg-navy-700 dark:text-white dark:border-white/20";
    case "qualified":
      return "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200";
    case "unqualified":
      return "bg-zinc-50 text-zinc-600 border border-zinc-200 dark:bg-navy-700 dark:text-gray-400 dark:border-white/20";
  }
}

function outcomeBadgeClass(outcome?: string | null) {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200";
  }
  if (lower.includes("ended")) {
    return "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200";
  }
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) {
    return "bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-200";
  }
  return "bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-200";
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

    if (!error && data && (data as any)[col]) return (data as any)[col] as string;
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

export default async function Page(props: { params: any }) {
  const p = await Promise.resolve(props.params);
  const leadId = p?.leadId ?? p?.id;

  if (!leadId) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Lead not found</h1>
        <p className="text-sm text-muted-foreground">Missing lead id in route params.</p>
        <Link href="/dashboard/leads" className="text-sm underline">
          Back to Leads
        </Link>
      </div>
    );
  }

  if (!isUuid(leadId)) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Lead not found</h1>
        <p className="text-sm text-muted-foreground">Invalid lead id (not a UUID).</p>
        <Link href="/dashboard/leads" className="text-sm underline">
          Back to Leads
        </Link>
      </div>
    );
  }

  const orgId = await resolveOrgId();
  const lead = await getLead(orgId, leadId);

  if (!lead) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-2xl font-semibold">Lead not found</h1>
        <p className="text-sm text-muted-foreground">No lead found for this org.</p>
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
  
  // Last call (most recent) for outcome badge
  const lastCall = calls.length > 0 ? calls[0] : null;
  const lastCallOutcome = lastCall?.outcome ?? null;

  const st = safeStatus(lead.status);

  return (
    <div className="p-6 space-y-6">
      {/* Back Button */}
      <Link href="/dashboard/leads">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>

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
      </div>

      {/* Lead summary card */}
      <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Lead</h2>
        </div>
        <div className="mt-4 overflow-x-auto px-6 pb-6">
          <table className="min-w-full text-sm">
            <tbody className="divide-y divide-gray-200 dark:divide-white/10">
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Name</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{lead.name || "—"}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Phone</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white font-mono">{formatPhone(lead.phone)}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Email</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{lead.email || "—"}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Status</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(st)}`}>
                    {statusLabel(st)}
                  </span>
                </td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Source</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{lead.source || "—"}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Created</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatDate(lead.created_at)}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Last activity</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatDate(lead.updated_at)}</td>
              </tr>
              <tr className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                <td className="px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400">Lead ID</td>
                <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white font-mono">{lead.id}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Calls + Notes side-by-side */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 items-stretch">
        {/* Calls card */}
        <div className="!z-5 relative flex h-full flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Calls</h2>
          </div>
          {calls.length === 0 ? (
            <div className="mt-4 flex-1 px-6 pb-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">No calls yet</p>
            </div>
          ) : (
            <div className="mt-4 flex-1 overflow-x-auto px-6 pb-6 min-w-0">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-white/20">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Outcome</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Cost</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 dark:text-white">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                  {calls.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(c.started_at)}</td>
                      <td className="px-4 py-3">
                        {c.outcome ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${outcomeBadgeClass(c.outcome)}`}>
                            {c.outcome}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatDuration(c.duration_seconds ?? 0)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatUSD(c.cost_usd ?? 0)}</td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/calls/${c.id}`}
                          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
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

        {/* Notes card */}
        <div className="!z-5 relative flex h-full flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Notes</h2>
            <button
              type="button"
              className="linear flex cursor-pointer items-center justify-center rounded-xl bg-brand-500 px-4 py-[11px] font-bold text-white transition duration-200 hover:bg-brand-600 hover:text-white active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-300 dark:active:bg-brand-200"
              title="Coming soon"
              disabled
            >
              Add note
            </button>
          </div>
          <div className="mt-4 flex-1 overflow-x-auto px-6 pb-6 min-w-0">
            {lead.notes ? (
              <div className="space-y-3">
                <div className="rounded-lg bg-gray-50 dark:bg-navy-700 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 dark:text-gray-400">{formatDate(lead.updated_at)}</p>
                      <p className="mt-2 text-sm font-medium text-navy-700 dark:text-white">{lead.notes}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400">No notes yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Related calls - full width */}
      <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Related Calls</h2>
        </div>
        {calls.length === 0 ? (
          <div className="mt-4 px-6 pb-6">
            <div className="py-10 text-center">
              <p className="text-sm font-medium text-gray-900 dark:text-white">No calls yet</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Once calls are linked to this lead (calls.lead_id), they will appear here.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto px-6 pb-6">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-white/20">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Outcome</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-white">Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-600 dark:text-white">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                {calls.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-navy-700/50">
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(c.started_at)}</td>
                    <td className="px-4 py-3">
                      {c.outcome ? (
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${outcomeBadgeClass(c.outcome)}`}>
                          {c.outcome}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-600 dark:text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatDuration(c.duration_seconds ?? 0)}</td>
                    <td className="px-4 py-3 text-sm font-bold text-navy-700 dark:text-white">{formatUSD(c.cost_usd ?? 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/calls/${c.id}`}
                        className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-navy-700 dark:text-white dark:hover:bg-navy-600"
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
    </div>
  );
}
