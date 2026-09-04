import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUserResult } from "@/lib/auth/currentUser";
import { ArrowLeft, CircleDollarSign, Clock3, PhoneCall, UserRound } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui-horizon/badge";
import { HorizonLinkButton } from "@/components/ui-horizon/button";
import Card from "@/components/ui-horizon/card";
import { EmptyState } from "@/components/ui-horizon/empty";
import PageHeader from "@/components/ui-horizon/page-header";
import { Stat } from "@/components/ui-horizon/stat";

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

function statusVariant(s: LeadStatus): BadgeProps["variant"] {
  switch (s) {
    case "new":
      return "info";
    case "contacted":
      return "warning";
    case "qualified":
      return "success";
    case "unqualified":
      return "default";
  }
}

function outcomeVariant(outcome?: string | null): BadgeProps["variant"] {
  const lower = (outcome ?? "").toLowerCase();
  if (lower.includes("completed") || lower.includes("end-of-call-report")) {
    return "success";
  }
  if (lower.includes("ended")) {
    return "default";
  }
  if (lower.includes("failed") || lower.includes("error") || lower.includes("no-answer")) {
    return "destructive";
  }
  return "info";
}

function MissingLead({ description }: { description: string }) {
  return (
    <div className="pb-8">
      <PageHeader title="Lead not found" subtitle={description} />
      <Card>
        <EmptyState
          icon={<UserRound />}
          title="This lead is unavailable"
          description="It may have been removed, or the link may belong to another workspace."
          action={
            <HorizonLinkButton href="/dashboard/leads" size="sm">
              <ArrowLeft /> Back to leads
            </HorizonLinkButton>
          }
        />
      </Card>
    </div>
  );
}

async function resolveOrgId() {
  const supabase = await createSupabaseServerClient();
  const { user: cachedUser, error: authErr } = await getCachedUserResult();
  const auth = { user: cachedUser };
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

    const orgId = data && typeof data === "object" ? (data as Record<string, unknown>)[col] : null;
    if (!error && typeof orgId === "string" && orgId) return orgId;
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

export default async function Page(props: { params: Promise<{ leadId?: string; id?: string }> }) {
  const p = await props.params;
  const leadId = p?.leadId ?? p?.id;

  if (!leadId) {
    return <MissingLead description="The link does not include a lead ID." />;
  }

  if (!isUuid(leadId)) {
    return <MissingLead description="The link contains an invalid lead ID." />;
  }

  const orgId = await resolveOrgId();
  const lead = await getLead(orgId, leadId);

  if (!lead) {
    return <MissingLead description="No matching lead was found in this workspace." />;
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
    <div className="space-y-6 pb-8">
      <PageHeader
        title={lead.name || "Unnamed lead"}
        subtitle="Contact details, status, notes, and related call activity."
        action={
          <HorizonLinkButton href="/dashboard/leads" variant="ghost" size="sm">
            <ArrowLeft /> Back to leads
          </HorizonLinkButton>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Calls" value={totalCalls} helperText="Linked to this lead" icon={<PhoneCall />} />
        <Stat label="Average duration" value={formatDuration(avgDuration)} helperText="Across linked calls" icon={<Clock3 />} />
        <Stat label="Call spend" value={formatUSD(totalCost)} helperText="Linked call total" icon={<CircleDollarSign />} />
        <Stat label="Latest outcome" value={lastCallOutcome ?? "—"} helperText={lastCall ? formatDate(lastCall.started_at) : "No calls yet"} icon={<UserRound />} />
      </div>

      {/* Lead summary card */}
      <Card>
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
                  <Badge variant={statusVariant(st)} dot>{statusLabel(st)}</Badge>
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
      </Card>

      {/* Notes */}
      <div>
        <Card className="h-full">
          <div className="flex items-center justify-between px-6 pt-6">
            <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Notes</h2>
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
        </Card>
      </div>

      {/* Related calls - full width */}
      <Card>
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Related Calls</h2>
        </div>
        {calls.length === 0 ? (
          <EmptyState
            icon={<PhoneCall />}
            title="No calls yet"
            description="Calls linked to this lead will appear here automatically."
          />
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
                        <Badge variant={outcomeVariant(c.outcome)} dot>{c.outcome}</Badge>
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
      </Card>
    </div>
  );
}
