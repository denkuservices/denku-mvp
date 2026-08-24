import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { getOutcomeCounts } from "@/lib/platform/readModel/outcomes";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * OUTCOME COUNTS CONTRACT (Phase 6).
 *
 * Home's headline numbers answer "what did my AI team accomplish this week". Two properties keep
 * them trustworthy:
 *
 *  1. **A failed query returns null, never 0.** A zero and an unknown are different facts; the UI
 *     renders "—" for null. Collapsing them would let an outage read as "your AI did nothing",
 *     which is both false and alarming.
 *  2. **Counts are windowed**, so they never present an all-time total as a weekly result.
 */

type Recorded = { table: string; filters: Array<[string, unknown]>; gte: Array<[string, unknown]> };

/** Minimal Supabase stub recording what was asked, returning a scripted count per table. */
function stubDb(
  counts: Record<string, { count?: number | null; error?: unknown }>,
  recorded: Recorded[] = []
): SupabaseClient {
  return {
    from(table: string) {
      const rec: Recorded = { table, filters: [], gte: [] };
      recorded.push(rec);
      const result = counts[table] ?? { count: 0 };
      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          rec.filters.push([col, val]);
          return builder;
        },
        gte: (col: string, val: unknown) => {
          rec.gte.push([col, val]);
          return builder;
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(resolve({ count: result.count ?? null, error: result.error ?? null })),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("getOutcomeCounts", () => {
  it("returns nulls without querying when there is no org", async () => {
    const recorded: Recorded[] = [];
    const out = await getOutcomeCounts("", 7, stubDb({}, recorded));
    expect(out.newContacts).toBeNull();
    expect(out.appointmentsBooked).toBeNull();
    expect(recorded).toEqual([]);
  });

  it("reports real counts per outcome", async () => {
    const out = await getOutcomeCounts(
      "org-1",
      7,
      stubDb({ leads: { count: 4 }, tickets: { count: 9 }, appointments: { count: 2 } })
    );
    expect(out.newContacts).toBe(4);
    expect(out.appointmentsBooked).toBe(2);
    expect(out.requestsCreated).toBe(9);
    expect(out.windowDays).toBe(7);
  });

  it("returns null — not 0 — when a query fails", async () => {
    const out = await getOutcomeCounts(
      "org-1",
      7,
      stubDb({ leads: { error: { message: "boom" } }, tickets: { count: 3 }, appointments: { count: 1 } })
    );
    expect(out.newContacts).toBeNull();
    // A neighbouring failure must not poison the counts that did succeed.
    expect(out.requestsCreated).toBe(3);
    expect(out.appointmentsBooked).toBe(1);
  });

  it("distinguishes a genuine zero from an unknown", async () => {
    const out = await getOutcomeCounts("org-1", 7, stubDb({ leads: { count: 0 }, tickets: { count: 0 }, appointments: { count: 0 } }));
    expect(out.newContacts).toBe(0);
    expect(out.newContacts).not.toBeNull();
  });

  it("scopes every query to the org and constrains it to the window", async () => {
    const recorded: Recorded[] = [];
    await getOutcomeCounts("org-42", 7, stubDb({ leads: { count: 1 }, tickets: { count: 1 }, appointments: { count: 1 } }, recorded));

    expect(recorded.length).toBeGreaterThan(0);
    for (const r of recorded) {
      // Cross-tenant safety: the service-role client has no RLS net, so org_id is mandatory.
      expect(r.filters.some(([col, val]) => col === "org_id" && val === "org-42")).toBe(true);
      expect(r.gte.length).toBeGreaterThan(0);
    }
  });

  it("measures resolved requests on updated_at with a closed status", async () => {
    const recorded: Recorded[] = [];
    await getOutcomeCounts("org-1", 7, stubDb({ tickets: { count: 5 }, leads: { count: 0 }, appointments: { count: 0 } }, recorded));

    const resolved = recorded.find((r) => r.table === "tickets" && r.filters.some(([c]) => c === "status"));
    expect(resolved).toBeDefined();
    expect(resolved!.filters).toContainEqual(["status", "closed"]);
    expect(resolved!.gte.some(([col]) => col === "updated_at")).toBe(true);
  });

  it("honours a custom window length", async () => {
    const recorded: Recorded[] = [];
    const before = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const out = await getOutcomeCounts("org-1", 30, stubDb({ leads: { count: 0 }, tickets: { count: 0 }, appointments: { count: 0 } }, recorded));

    expect(out.windowDays).toBe(30);
    const since = Date.parse(String(recorded[0].gte[0][1]));
    // Within a second of the requested boundary.
    expect(Math.abs(since - before)).toBeLessThan(1000);
  });
});
