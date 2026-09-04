import Link from "next/link";
import { ArrowRight, SearchX, TrendingUp, UserPlus, Users } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUserResult } from "@/lib/auth/currentUser";
import { Badge, type BadgeProps } from "@/components/ui-horizon/badge";
import { HorizonButton, HorizonLinkButton } from "@/components/ui-horizon/button";
import { CONTROL_CLASS, FieldLabel, SearchControl } from "@/components/ui-horizon/controls";
import { EmptyState } from "@/components/ui-horizon/empty";
import PageHeader from "@/components/ui-horizon/page-header";
import { Stat } from "@/components/ui-horizon/stat";
import {
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from "@/components/ui-horizon/table";

type LeadStatus = "new" | "contacted" | "qualified" | "unqualified";
type LeadSource = "web" | "inbound_call" | "referral" | "import";

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string; // DB is text
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
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

function safeSource(s?: string | null): LeadSource | "unknown" {
  const v = (s || "").toLowerCase();
  if (v === "web" || v === "inbound_call" || v === "referral" || v === "import") return v;
  return "unknown";
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

function sourceLabel(s: ReturnType<typeof safeSource>) {
  switch (s) {
    case "web":
      return "Web";
    case "inbound_call":
      return "Inbound call";
    case "referral":
      return "Referral";
    case "import":
      return "Import";
    default:
      return "—";
  }
}

function sevenDaysAgoTimestamp() {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

/**
 * Resolve org_id for tenant scoping.
 * Tries common column names in `profiles` (because schemas differ between projects).
 */
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
    if (!error && typeof orgId === "string" && orgId) {
      return orgId;
    }
  }

  throw new Error(
    "Could not resolve org_id for this user. Expected one of: profiles.org_id / organization_id / current_org_id / orgs_id."
  );
}

async function getLeadsFromDb(opts: { orgId: string; q?: string; status?: string }) {
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("leads")
    .select("id,name,phone,email,source,status,notes,created_at,updated_at")
    .eq("org_id", opts.orgId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (opts.status) query = query.eq("status", opts.status);

  if (opts.q) {
    const q = opts.q.replace(/"/g, '""');
    query = query.or(`name.ilike."%${q}%",phone.ilike."%${q}%",email.ilike."%${q}%"`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadRow[];
}

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Next.js 16.1.1: searchParams must be awaited before accessing properties
  const sp = searchParams ? await searchParams : undefined;
  const q = asString(sp?.q).trim();
  const status = asString(sp?.status).trim();

  const orgId = await resolveOrgId();
  const rows = await getLeadsFromDb({ orgId, q: q || undefined, status: status || undefined });

  const totalLeads = rows.length;
  const sevenDaysAgo = sevenDaysAgoTimestamp();
  const new7d = rows.filter((l) => new Date(l.created_at).getTime() >= sevenDaysAgo).length;

  const contactedCount = rows.filter((l) => {
    const s = safeStatus(l.status);
    return s === "contacted" || s === "qualified";
  }).length;

  const contactRate = totalLeads === 0 ? 0 : Math.round((contactedCount / totalLeads) * 100);
  const hasFilters = Boolean(q || status);

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Leads"
        subtitle="Review new prospects, follow up quickly, and keep every conversation moving."
        action={
          <HorizonLinkButton href="/dashboard/leads/new" variant="primary">
            <UserPlus />
            Create lead
          </HorizonLinkButton>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="Total leads" value={totalLeads} helperText="In this workspace" icon={<Users />} />
        <Stat label="New leads" value={new7d} helperText="Last 7 days" icon={<UserPlus />} />
        <Stat label="Contact rate" value={`${contactRate}%`} helperText="Contacted or qualified" icon={<TrendingUp />} />
      </div>

      {/* Controls */}
      <form className="rounded-[20px] border border-gray-200/70 bg-white p-4 shadow-shadow-100 dark:border-white/10 dark:bg-navy-800 dark:shadow-none">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="grid w-full gap-3 md:max-w-[900px] md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <FieldLabel htmlFor="lead-search">Search</FieldLabel>
              <SearchControl
                id="lead-search"
                name="q"
                defaultValue={q}
                placeholder="Name, phone, or email…"
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="lead-status">Status</FieldLabel>
              <select
                id="lead-status"
                name="status"
                defaultValue={status}
                className={CONTROL_CLASS}
              >
                <option value="">All</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="unqualified">Unqualified</option>
              </select>
            </div>
          </div>

          <div className="flex w-full justify-end gap-2 md:w-auto">
            <HorizonButton type="submit" variant="primary">
              Apply
            </HorizonButton>
            {hasFilters ? (
              <HorizonLinkButton href="/dashboard/leads" title="Clear filters">
                Reset
              </HorizonLinkButton>
            ) : null}
          </div>
        </div>
      </form>

      {/* Table */}
      <TableCard>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
          <div>
            <p className="text-sm font-semibold text-navy-700 dark:text-white">Results</p>
            <p className="mt-0.5 text-xs text-gray-500">{rows.length} leads</p>
          </div>
          {hasFilters ? <Badge variant="info">Filtered</Badge> : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <SearchX /> : <Users />}
            title={hasFilters ? "No leads match these filters" : "No leads yet"}
            description={hasFilters ? "Try a broader search or reset the status filter." : "Create your first lead or let Denku capture one from an inbound conversation."}
            action={
              hasFilters ? (
                <HorizonLinkButton href="/dashboard/leads" size="sm">Reset filters</HorizonLinkButton>
              ) : (
                <HorizonLinkButton href="/dashboard/leads/new" variant="primary" size="sm">Create lead</HorizonLinkButton>
              )
            }
          />
        ) : (
          <TableRoot>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
<TableBody>
  {rows.map((row) => {
    const st = safeStatus(row.status);
    const src = safeSource(row.source);

    const leadId = row.id;
    const isUuid =
      typeof leadId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId);

    return (
      <TableRow key={leadId}>
        <TableCell>
          <div className="font-semibold text-navy-700 dark:text-white">{row.name || "Unnamed lead"}</div>
          <div className="mt-0.5 max-w-40 truncate font-mono text-[11px] text-gray-400">{leadId ?? "—"}</div>
        </TableCell>

        <TableCell className="whitespace-nowrap font-mono text-xs md:text-sm">{formatPhone(row.phone)}</TableCell>

        <TableCell><Badge variant={statusVariant(st)} dot>{statusLabel(st)}</Badge></TableCell>

        <TableCell>{sourceLabel(src)}</TableCell>

        <TableCell className="whitespace-nowrap text-gray-500">{formatDate(row.updated_at)}</TableCell>

        <TableCell className="text-right">
          {isUuid ? (
            <Link
              href={`/dashboard/leads/${leadId}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 transition hover:text-brand-600"
            >
              View <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed text-xs font-semibold text-gray-400"
              title="Invalid lead id"
            >
              View
            </button>
          )}
        </TableCell>
      </TableRow>
    );
  })}
</TableBody>
          </TableRoot>
        )}
      </TableCard>
    </div>
  );
}
