import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

/**
 * Resolve org_id for tenant scoping.
 * Tries common column names in `profiles` (because schemas differ between projects).
 */
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
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const q = asString(searchParams?.q).trim();
  const status = asString(searchParams?.status).trim();

  const orgId = await resolveOrgId();
  const rows = await getLeadsFromDb({ orgId, q: q || undefined, status: status || undefined });

  const totalLeads = rows.length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const new7d = rows.filter((l) => new Date(l.created_at).getTime() >= sevenDaysAgo).length;

  const contactedCount = rows.filter((l) => {
    const s = safeStatus(l.status);
    return s === "contacted" || s === "qualified";
  }).length;

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
          <p className="mt-1 text-xs text-muted-foreground">In this org</p>
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
            placeholder="Name, phone, or email…"
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
          <button type="submit" className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50">
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
          <p className="text-xs text-muted-foreground">{rows.length} leads</p>
        </div>

        {rows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No leads found</p>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or status filter.</p>
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
                  <th className="px-4 py-3 font-medium">Last activity</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
<tbody>
  {rows.map((row) => {
    const st = safeStatus(row.status);
    const src = safeSource(row.source);

    const leadId = (row as any)?.id;
    const isUuid =
      typeof leadId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId);

    return (
      <tr key={leadId ?? `${row.name ?? "lead"}-${row.updated_at ?? Math.random()}`} className="border-b last:border-b-0">
        <td className="px-4 py-3">
          <div className="font-medium">{row.name || "—"}</div>
          <div className="text-xs text-muted-foreground">ID: {leadId ?? "—"}</div>
        </td>

        <td className="px-4 py-3 font-mono text-xs md:text-sm">{formatPhone(row.phone)}</td>

        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${statusBadgeClass(st)}`}
          >
            {statusLabel(st)}
          </span>
        </td>

        <td className="px-4 py-3">{sourceLabel(src)}</td>

        <td className="px-4 py-3 text-muted-foreground">{formatDate(row.updated_at)}</td>

        <td className="px-4 py-3 text-right">
          {isUuid ? (
            <Link
              href={`/dashboard/leads/${leadId}`}
              className="rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50"
            >
              View
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-md border bg-white px-3 py-2 text-xs font-medium opacity-50 cursor-not-allowed"
              title="Invalid lead id"
            >
              View
            </button>
          )}
        </td>
      </tr>
    );
  })}
</tbody>

            </table>
          </div>
        )}
      </div>
    </div>
  );
}
