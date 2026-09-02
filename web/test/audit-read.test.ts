import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The query path of the audit log — the half `audit-log.test.ts` did not cover, and the half that
 * broke in production.
 *
 * **The bug this suite exists for.** `applyFilters` was `async` and returned the PostgREST query
 * BUILDER. A builder is a thenable, so the async machinery awaited it — which EXECUTES the query —
 * and the caller got a response object back instead of a builder. The next `.order(...)` was
 * `undefined`, `readAuditPage` threw, and every audit page load showed "We couldn't load the audit
 * log". TypeScript said nothing because the builder was typed `any`.
 *
 * The stub below is deliberately **thenable**, exactly like a real builder. That is what gives the
 * suite its teeth: a stub that could not be awaited would have let the broken version pass.
 */

type Response = { data: unknown[]; error: unknown; count?: number };

/** A chainable, awaitable stand-in for a PostgREST builder that records what was called on it. */
function makeBuilder(response: Response, calls: string[][]) {
  const builder: Record<string, unknown> = {
    then(resolve: (v: Response) => unknown) {
      calls.push(["await"]);
      return Promise.resolve(response).then(resolve);
    },
  };

  for (const method of ["select", "eq", "like", "gte", "lte", "or", "in", "order", "range", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args.map((a) => JSON.stringify(a))]);
      return builder;
    };
  }

  return builder;
}

const calls: string[][] = [];
const responses: Record<string, Response> = {};

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from(table: string) {
      calls.push(["from", table]);
      return makeBuilder(responses[table] ?? { data: [], error: null, count: 0 }, calls);
    },
  },
}));

import { readAuditForExport, readAuditPage } from "@/lib/audit/read";

const AUDIT_ROW = {
  id: "log-1",
  action: "billing.plan.change",
  entity_type: "billing.plan",
  entity_id: "org-1",
  created_at: "2026-09-01T10:00:00.000Z",
  actor_user_id: "user-1",
};

function called(method: string): string[][] {
  return calls.filter((c) => c[0] === method);
}

function argsOf(method: string): string {
  return called(method).map((c) => c.slice(1).join(" ")).join(" | ");
}

beforeEach(() => {
  calls.length = 0;
  for (const key of Object.keys(responses)) delete responses[key];
  responses.audit_log = { data: [AUDIT_ROW], error: null, count: 1 };
  responses.profiles = {
    data: [{ id: "user-1", email: "ada@example.com", full_name: "Ada Lovelace" }],
    error: null,
  };
  responses.audit_log_changes = {
    data: [
      { audit_log_id: "log-1", field: "plan_code", before_value: "starter", after_value: "growth" },
    ],
    error: null,
  };
});

describe("readAuditPage — the regression", () => {
  it("returns entries instead of throwing", async () => {
    // The exact failure a customer saw: this threw, and the page rendered its error notice.
    const page = await readAuditPage("org-1", {}, 1);
    expect(page.entries).toHaveLength(1);
    expect(page.total).toBe(1);
  });

  it("chains order and range ONTO the builder, not onto an already-executed query", async () => {
    await readAuditPage("org-1", {}, 1);
    // If the filters were awaited into a response, neither of these could have been called.
    expect(called("order")).toHaveLength(1);
    expect(called("range")).toHaveLength(1);
  });

  it("joins the actor and the field changes onto the entry", async () => {
    const page = await readAuditPage("org-1", {}, 1);
    expect(page.entries[0].actor_name).toBe("Ada Lovelace");
    expect(page.entries[0].changes).toEqual([
      { field: "plan_code", before_value: "starter", after_value: "growth" },
    ]);
  });

  it("scopes every read to the org", async () => {
    await readAuditPage("org-1", {}, 1);
    expect(argsOf("eq")).toContain('"org_id" "org-1"');
  });

  it("pages with a half-open range and reports the page count", async () => {
    responses.audit_log = { data: [AUDIT_ROW], error: null, count: 60 };
    const page = await readAuditPage("org-1", {}, 2, 25);
    expect(argsOf("range")).toContain("25 49");
    expect(page.pageCount).toBe(3);
    expect(page.page).toBe(2);
  });

  it("treats a nonsense page number as the first page", async () => {
    const page = await readAuditPage("org-1", {}, Number.NaN);
    expect(page.page).toBe(1);
  });

  it("throws only when the database actually errors", async () => {
    responses.audit_log = { data: [], error: { message: "boom" }, count: 0 };
    await expect(readAuditPage("org-1", {}, 1)).rejects.toThrow("audit_read_failed");
  });

  it("does not query for actors or changes when there are no rows", async () => {
    responses.audit_log = { data: [], error: null, count: 0 };
    const page = await readAuditPage("org-1", {}, 1);
    expect(page.entries).toEqual([]);
    expect(calls.filter((c) => c[0] === "from" && c[1] === "audit_log_changes")).toHaveLength(0);
  });
});

describe("readAuditPage — filters reach the query", () => {
  it("matches a category as an action prefix", async () => {
    await readAuditPage("org-1", { category: "billing" }, 1);
    expect(argsOf("like")).toContain('"action" "billing.%"');
  });

  it("filters by actor", async () => {
    await readAuditPage("org-1", { actorId: "user-9" }, 1);
    expect(argsOf("eq")).toContain('"actor_user_id" "user-9"');
  });

  it("makes the to-date inclusive of the whole day", async () => {
    await readAuditPage("org-1", { from: "2026-09-01", to: "2026-09-02" }, 1);
    expect(argsOf("gte")).toContain("2026-09-01T00:00:00.000Z");
    expect(argsOf("lte")).toContain("2026-09-02T23:59:59.999Z");
  });

  it("folds matching people into the search, so a colleague's name finds their actions", async () => {
    await readAuditPage("org-1", { q: "Ada" }, 1);
    const or = argsOf("or");
    expect(or).toContain("action.ilike.%Ada%");
    expect(or).toContain("actor_user_id.in.(user-1)");
  });

  it("strips characters that would rewrite the PostgREST filter rather than be searched for", async () => {
    await readAuditPage("org-1", { q: "a,b(c)%d" }, 1);
    const or = argsOf("or").split("|").find((c) => c.includes("action.ilike")) ?? "";
    expect(or).not.toContain("(c)");
    expect(or).not.toContain("%d%");
  });

  it("does not look up actors when the term is only punctuation", async () => {
    await readAuditPage("org-1", { q: "%%%" }, 1);
    expect(calls.filter((c) => c[0] === "from" && c[1] === "profiles")).toHaveLength(1); // hydrate only
  });
});

describe("readAuditForExport", () => {
  it("returns rows and caps them rather than paging", async () => {
    const rows = await readAuditForExport("org-1", {});
    expect(rows).toHaveLength(1);
    expect(called("limit")).toHaveLength(1);
    expect(called("range")).toHaveLength(0);
  });

  it("applies the same filters the page does", async () => {
    await readAuditForExport("org-1", { category: "member" });
    expect(argsOf("like")).toContain('"action" "member.%"');
  });
});
