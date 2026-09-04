import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { listConversationPage } from "@/lib/platform/readModel/conversations";

/**
 * The Inbox list scans five hundred rows to render twenty-five of them.
 *
 * `calls.transcript` is the biggest column on a call and it was on every one of those five
 * hundred, for the sake of a 140-character preview under the twenty-five that survive. The scan
 * now leaves it behind and the previews are fetched afterwards, by id, for the page.
 *
 * What has to stay true is that the rows look exactly the same to the reader. These tests use a
 * fake that behaves like Postgres — it returns only the columns that were asked for — so a
 * regression where the preview silently became null would fail here rather than in production.
 */

const ORG = "org-1";

const CALLS = [
  {
    id: "call-1",
    agent_id: "agent-1",
    from_phone: "+13215550123",
    lead_id: "lead-1",
    intent: "appointment",
    outcome: null,
    completion_state: "completed",
    transcript: "AI: Hello, how can I help? User: I'd like to book a table for four.",
    duration_seconds: 65,
    direction: "inbound",
    started_at: "2026-08-27T10:00:00.000Z",
    ended_at: "2026-08-27T10:01:05.000Z",
    created_at: "2026-08-27T10:00:00.000Z",
  },
  {
    id: "call-2",
    agent_id: "agent-1",
    from_phone: "+13215550999",
    lead_id: "lead-2",
    intent: "support",
    outcome: null,
    completion_state: "completed",
    transcript: "AI: Hello. User: My boiler is leaking.",
    duration_seconds: 40,
    direction: "inbound",
    started_at: "2026-08-26T10:00:00.000Z",
    ended_at: "2026-08-26T10:00:40.000Z",
    created_at: "2026-08-26T10:00:00.000Z",
  },
];

interface Issued {
  table: string;
  select: string;
  in?: unknown[];
}

/** A fake that projects to the requested columns, the way the database does. */
function projectingDb(issued: Issued[], opts: { failHydration?: boolean } = {}) {
  return {
    from(table: string) {
      const state: Issued = { table, select: "" };
      issued.push(state);

      const rowsFor = (): unknown[] => {
        if (table === "agents") return [{ id: "agent-1", name: "Front Desk", timezone: null }];
        if (table !== "calls") return [];

        const cols = state.select.split(",").map((c) => c.trim());
        let rows = CALLS as Array<Record<string, unknown>>;
        if (state.in) {
          const wanted = new Set(state.in as string[]);
          rows = rows.filter((r) => wanted.has(r.id as string));
        }
        return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
      };

      const chain: Record<string, unknown> = {};
      for (const m of ["eq", "neq", "is", "not", "gt", "gte", "lt", "lte", "match", "or", "order", "limit", "range"]) {
        chain[m] = () => chain;
      }
      chain.select = (cols: string) => {
        state.select = cols;
        return chain;
      };
      chain.in = (_col: string, values: unknown[]) => {
        state.in = values;
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => {
        // `state.in` is only set by the preview lookup, which is the query this option breaks.
        if (opts.failHydration && table === "calls" && state.in) {
          return resolve({ data: null, error: { message: "boom" } });
        }
        return resolve({ data: rowsFor(), error: null, count: rowsFor().length });
      };
      chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
      chain.single = () => Promise.resolve({ data: null, error: null });
      return chain;
    },
  } as never;
}

describe("inbox preview hydration", () => {
  it("still shows what the caller said, without scanning every transcript", async () => {
    const issued: Issued[] = [];
    const page = await listConversationPage(ORG, { limit: 25 }, projectingDb(issued));

    // The reader sees exactly what they saw before.
    expect(page.items).toHaveLength(2);
    expect(page.items[0].summary).toBe("I'd like to book a table for four.");
    expect(page.items[1].summary).toBe("My boiler is leaking.");

    const callQueries = issued.filter((q) => q.table === "calls");
    const scan = callQueries.find((q) => !q.in);
    const hydrate = callQueries.find((q) => q.in);

    // The wide scan no longer drags transcripts across the wire …
    expect(scan).toBeDefined();
    expect(scan!.select).not.toContain("transcript");

    // … and the previews come from a narrow follow-up bounded to the page's own ids.
    expect(hydrate).toBeDefined();
    expect(hydrate!.select).toBe("id, transcript");
    expect(hydrate!.in).toEqual(["call-1", "call-2"]);
  });

  it("keeps the full scan when the reader is searching", async () => {
    const issued: Issued[] = [];
    const page = await listConversationPage(ORG, { limit: 25, search: "boiler" }, projectingDb(issued));

    // Matching on what was said means having what was said for every candidate row.
    expect(page.items).toHaveLength(1);
    expect(page.items[0].id).toBe("call-2");

    const callQueries = issued.filter((q) => q.table === "calls");
    expect(callQueries).toHaveLength(1);
    expect(callQueries[0].select).toContain("transcript");
  });

  it("hydrates only the page, not the whole scanned window", async () => {
    const issued: Issued[] = [];
    await listConversationPage(ORG, { limit: 1 }, projectingDb(issued));

    const hydrate = issued.find((q) => q.table === "calls" && q.in);
    expect(hydrate!.in).toEqual(["call-1"]);
  });

  it("renders the row rather than failing when the preview lookup breaks", async () => {
    const issued: Issued[] = [];
    const page = await listConversationPage(
      ORG,
      { limit: 25 },
      projectingDb(issued, { failHydration: true })
    );
    expect(page.items).toHaveLength(2);
    // No preview is the same thing a call with no transcript already renders as — never a crash.
    expect(page.items[0].summary).toBeNull();
  });
});
