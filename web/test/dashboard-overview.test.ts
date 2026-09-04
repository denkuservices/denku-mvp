import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("redirected"); }) }));

const USER = { id: "user-1", email: "owner@shop.test", user_metadata: { full_name: "Ada" } };
vi.mock("@/lib/auth/currentUser", () => ({
  getCachedUser: vi.fn(async () => USER),
  getCachedUserResult: vi.fn(async () => ({ user: USER, error: null })),
}));

const client = { from: vi.fn() };
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => client) }));

import { getDashboardOverview } from "@/lib/dashboard/getDashboardOverview";

/**
 * Home is the first screen a customer sees after signing in, and it used to build itself out of a
 * dozen queries that each waited for the one before. They are now all started together.
 *
 * Two things have to hold, and the second is the one a refactor like this can quietly break:
 *
 *  1. the queries really do overlap (otherwise the change bought nothing), and
 *  2. every number still comes from the query it came from before — a hoist that wires the
 *     six-month scan into the eight-week chart would typecheck perfectly and be wrong.
 */

const ISO = (d: string) => new Date(d).toISOString();
const today = new Date();
const todayIso = new Date(today.getTime() - 60_000).toISOString();

/** Rows per table. `calls` is filtered by the window the query asked for, like the database. */
const TABLES: Record<string, Array<Record<string, unknown>>> = {
  profiles: [{ id: "user-1", org_id: "org-1", email: "owner@shop.test", full_name: "Ada" }],
  orgs: [{ id: "org-1", name: "Minos & Co" }],
  agents: [
    { id: "agent-1", name: "Front Desk", created_at: ISO("2026-01-01"), vapi_phone_number_id: "pn-1" },
    { id: "agent-2", name: "Night Line", created_at: ISO("2026-02-01"), vapi_phone_number_id: null },
  ],
  calls: [
    { id: "call-1", agent_id: "agent-1", started_at: todayIso, ended_at: todayIso, duration_seconds: 90, cost_usd: 0.4 },
    { id: "call-2", agent_id: "agent-1", started_at: todayIso, ended_at: todayIso, duration_seconds: 30, cost_usd: 0.2 },
  ],
  leads: [{ id: "lead-1", created_at: todayIso, agent_id: "agent-1" }],
  tickets: [{ id: "t-1", created_at: todayIso }],
  appointments: [{ id: "a-1", created_at: todayIso }],
};

interface Probe {
  maxInFlight: number;
  issued: Array<{ table: string; select: string }>;
}

function makeClient(probe: Probe) {
  let inFlight = 0;

  return (table: string) => {
    const state = { table, select: "", head: false, project: [] as string[] };

    const rows = () => {
      const base = TABLES[table] ?? [];
      if (state.project.length === 0) return base;
      return base.map((r) => Object.fromEntries(state.project.map((c) => [c, r[c]])));
    };

    const settle = async () => {
      inFlight += 1;
      probe.maxInFlight = Math.max(probe.maxInFlight, inFlight);
      // Defer past the microtask queue so overlapping queries are actually observable.
      await new Promise((r) => setTimeout(r, 0));
      inFlight -= 1;
      const data = rows();
      return { data: state.head ? null : data, count: data.length, error: null };
    };

    const chain: Record<string, unknown> = {};
    for (const m of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "in", "match", "or", "order", "limit", "range", "returns"]) {
      chain[m] = () => chain;
    }
    chain.select = (cols: string, opts?: { head?: boolean }) => {
      state.select = cols;
      state.head = Boolean(opts?.head);
      state.project = cols === "*" ? [] : cols.split(",").map((c) => c.trim());
      probe.issued.push({ table, select: cols });
      return chain;
    };
    chain.single = async () => ({ data: (TABLES[table] ?? [])[0] ?? null, error: null });
    chain.maybeSingle = async () => ({ data: (TABLES[table] ?? [])[0] ?? null, error: null });
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      settle().then(resolve, reject);
    return chain;
  };
}

describe("dashboard home overview", () => {
  let probe: Probe;

  beforeEach(() => {
    probe = { maxInFlight: 0, issued: [] };
    client.from = vi.fn(makeClient(probe));
  });

  it("issues its reads concurrently instead of one after another", async () => {
    await getDashboardOverview();

    // Sequential would peak at one. The exact number is not the contract — "many at once" is.
    expect(probe.maxInFlight).toBeGreaterThan(10);
  });

  it("still reports the same figures from the same queries", async () => {
    const overview = await getDashboardOverview();

    expect(overview.user).toEqual({ name: "Ada", org: "Minos & Co" });

    // Counts come from the head-count queries, one table each.
    expect(overview.metrics.agents_total).toBe(2);
    expect(overview.metrics.calls_total).toBe(2);
    expect(overview.metrics.leads_count).toBe(1);
    expect(overview.metrics.tickets_count).toBe(1);
    expect(overview.metrics.appointments_count).toBe(1);

    // Both of today's calls ended and ran over five seconds, so both count as handled.
    expect(overview.metrics.total_calls_month).toBe(2);
    expect(overview.metrics.handled_calls_month).toBe(2);
    expect(overview.metrics.answer_rate).toBe(100);
    expect(overview.metrics.total_calls_today).toBe(2);

    // The series keep their shapes: six months, eight weeks, and the current month populated.
    expect(overview.metrics.total_calls_series).toHaveLength(6);
    expect(overview.metrics.handled_calls_series).toHaveLength(6);
    expect(overview.metrics.weekly_outcomes).toHaveLength(8);
    expect(overview.metrics.total_calls_series[5].value).toBe(2);
    expect(overview.metrics.weekly_outcomes[7].handledCalls).toBe(2);

    // Readiness reads the roster, the profile and the call count — one agent has a number.
    expect(overview.readiness.steps.map((s) => s.done)).toEqual([true, true, true, true]);
    expect(overview.readiness.score).toBe(100);

    // Agent performance is keyed on the roster's ids, which is the one query still sequenced.
    expect(overview.metrics.agent_performance.length).toBeGreaterThan(0);
    expect(overview.metrics.agent_performance[0].total_calls).toBe(2);
  });

  it("asks each window for only the columns it aggregates", async () => {
    await getDashboardOverview();

    const selects = probe.issued.filter((i) => i.table === "calls").map((i) => i.select);

    // The savings window reads cost; the trend windows do not. Nothing pulls `raw_payload`.
    expect(selects).toContain("duration_seconds, cost_usd");
    expect(selects.some((s) => s.includes("raw_payload"))).toBe(false);
  });

  it("renders an empty workspace rather than failing when there is no org", async () => {
    const { getCachedUser } = await import("@/lib/auth/currentUser");
    vi.mocked(getCachedUser).mockResolvedValueOnce({ ...USER, id: "nobody" } as never);
    client.from = vi.fn((table: string) => {
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit", "returns"]) chain[m] = () => chain;
        chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
        return chain;
      }
      return makeClient(probe)(table);
    });

    const overview = await getDashboardOverview();
    expect(overview.user.org).toBe("—");
    expect(overview.metrics.calls_total).toBe(0);
    // Nothing was queried for a workspace that does not exist.
    expect(probe.issued.some((i) => i.table === "calls")).toBe(false);
  });
});
