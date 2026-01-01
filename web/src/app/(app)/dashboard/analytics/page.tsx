import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CallRow = {
  id: string;
  agent_id: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  cost_usd: number | null;
};

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

function toISODate(d: Date) {
  // YYYY-MM-DD
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseRange(input?: string): { days: number; label: string } {
  const v = (input || "7d").toLowerCase();
  if (v === "30d") return { days: 30, label: "Last 30 days" };
  if (v === "90d") return { days: 90, label: "Last 90 days" };
  return { days: 7, label: "Last 7 days" };
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

async function countTable(table: string, orgId: string, sinceISO?: string) {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);
  if (sinceISO) q = q.gte("created_at", sinceISO);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function getCalls(orgId: string, sinceISO: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("calls")
    .select("id,agent_id,started_at,duration_seconds,cost_usd")
    .eq("org_id", orgId)
    .gte("started_at", sinceISO)
    .order("started_at", { ascending: false })
    .limit(5000); // MVP: yeterli. Çok büyürse SQL aggregate’a geçeriz.

  if (error) throw new Error(error.message);
  return (data ?? []) as CallRow[];
}

export default async function Page({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const range = parseRange(searchParams?.range);
  const orgId = await resolveOrgId();

  // since (UTC)
  const now = new Date();
  const since = new Date(now.getTime() - range.days * 24 * 60 * 60 * 1000);
  const sinceISO = since.toISOString();

  const calls = await getCalls(orgId, sinceISO);

  // Optional: bu iki tablo yoksa yorum satırı yap.
  const [leadsCount, ticketsCount, apptsCount] = await Promise.all([
    countTable("leads", orgId, sinceISO),
    countTable("tickets", orgId, sinceISO),
    countTable("appointments", orgId, sinceISO),
  ]);

  const totalCalls = calls.length;
  const totalCost = calls.reduce((sum, c) => sum + Number(c.cost_usd ?? 0), 0);
  const totalDuration = calls.reduce((sum, c) => sum + Number(c.duration_seconds ?? 0), 0);
  const avgDuration = totalCalls === 0 ? 0 : Math.round(totalDuration / totalCalls);

  // Daily trend
  const dayMap = new Map<string, { calls: number; cost: number; dur: number }>();
  for (let i = 0; i < range.days; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = toISODate(d);
    dayMap.set(key, { calls: 0, cost: 0, dur: 0 });
  }

  for (const c of calls) {
    if (!c.started_at) continue;
    const d = new Date(c.started_at);
    const key = toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
    if (!dayMap.has(key)) continue;
    const row = dayMap.get(key)!;
    row.calls += 1;
    row.cost += Number(c.cost_usd ?? 0);
    row.dur += Number(c.duration_seconds ?? 0);
  }

  const dailyRows = Array.from(dayMap.entries())
    .map(([date, v]) => ({
      date,
      calls: v.calls,
      cost: v.cost,
      avgDuration: v.calls === 0 ? 0 : Math.round(v.dur / v.calls),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Agent breakdown
  const agentMap = new Map<string, { calls: number; cost: number; dur: number }>();
  for (const c of calls) {
    const k = c.agent_id ?? "unknown";
    const v = agentMap.get(k) ?? { calls: 0, cost: 0, dur: 0 };
    v.calls += 1;
    v.cost += Number(c.cost_usd ?? 0);
    v.dur += Number(c.duration_seconds ?? 0);
    agentMap.set(k, v);
  }

  const agentRows = Array.from(agentMap.entries())
    .map(([agent_id, v]) => ({
      agent_id,
      calls: v.calls,
      cost: v.cost,
      avgDuration: v.calls === 0 ? 0 : Math.round(v.dur / v.calls),
    }))
    .sort((a, b) => b.calls - a.calls);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">{range.label}</p>
        </div>

        {/* Range switch */}
        <div className="flex items-center gap-2">
          {["7d", "30d", "90d"].map((r) => (
            <Link
              key={r}
              href={`/dashboard/analytics?range=${r}`}
              className={`rounded-md border bg-white px-3 py-2 text-xs font-medium hover:bg-zinc-50 ${
                (searchParams?.range || "7d") === r ? "border-zinc-900" : ""
              }`}
            >
              {r.toUpperCase()}
            </Link>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Total calls</p>
          <p className="mt-1 text-2xl font-semibold">{totalCalls}</p>
          <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Total cost</p>
          <p className="mt-1 text-2xl font-semibold">{formatUSD(totalCost)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Estimated (calls.cost_usd)</p>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Avg duration</p>
          <p className="mt-1 text-2xl font-semibold">{formatDuration(avgDuration)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Across calls</p>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Leads created</p>
          <p className="mt-1 text-2xl font-semibold">{leadsCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Tickets created</p>
          <p className="mt-1 text-2xl font-semibold">{ticketsCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
        </div>

        <div className="rounded-xl border bg-white p-4 lg:col-span-2">
          <p className="text-sm text-muted-foreground">Appointments created</p>
          <p className="mt-1 text-2xl font-semibold">{apptsCount}</p>
          <p className="mt-1 text-xs text-muted-foreground">In selected range</p>
        </div>
      </div>

      {/* Daily trend */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">Daily trend</p>
          <p className="text-xs text-muted-foreground">Calls / cost / avg duration by day</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Calls</th>
                <th className="px-4 py-3 font-medium">Avg duration</th>
                <th className="px-4 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.date} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs">{r.date}</td>
                  <td className="px-4 py-3">{r.calls}</td>
                  <td className="px-4 py-3">{formatDuration(r.avgDuration)}</td>
                  <td className="px-4 py-3">{formatUSD(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Agent breakdown */}
      <div className="rounded-xl border bg-white">
        <div className="border-b p-4">
          <p className="text-sm font-medium">By agent</p>
          <p className="text-xs text-muted-foreground">Top agents by call volume</p>
        </div>

        {agentRows.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium">No calls</p>
            <p className="mt-1 text-sm text-muted-foreground">Make a test call to populate analytics.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 font-medium">Agent ID</th>
                  <th className="px-4 py-3 font-medium">Calls</th>
                  <th className="px-4 py-3 font-medium">Avg duration</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {agentRows.map((r) => (
                  <tr key={r.agent_id} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs">{r.agent_id}</td>
                    <td className="px-4 py-3">{r.calls}</td>
                    <td className="px-4 py-3">{formatDuration(r.avgDuration)}</td>
                    <td className="px-4 py-3">{formatUSD(r.cost)}</td>
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
