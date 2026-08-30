import { describe, it, expect, vi } from "vitest";

// Both read models' module graphs reach the fail-fast service-role client.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { searchWorkspace, searchPattern, SEARCH_MIN_LENGTH } from "@/lib/platform/readModel/search";
import { loadAttentionFeed } from "@/lib/platform/readModel/attention";
import { makeChain, hasOrgScope, type ChainCall } from "./helpers/supabaseMock";

/**
 * The topbar's two read models — workspace search, and the notification bell's feed.
 *
 * Both are rendered on EVERY dashboard page, for every org, whether or not that org's optional
 * migrations ran. So the properties worth pinning are not "does it find things" but:
 *
 *  1. **Org scope.** Both run on the service-role client, where a missing `org_id` filter is a
 *     cross-tenant leak rather than a bug.
 *  2. **The typed text cannot reshape a query.** PostgREST's `or=` filter is comma-delimited, so
 *     a comma in a customer's search box must not decide which columns are searched.
 *  3. **Missing tables degrade, never throw.** A search must still find a customer when the
 *     tickets table is absent; a bell must go quiet rather than take the shell down with it.
 *  4. **The badge equals the list.** A bell showing "3" over two rows is worse than no bell.
 */

const ORG = "org-1";
const USER = "user-1";

/**
 * A per-table fake: tables listed here answer, anything else answers like a missing table.
 *
 * `maybeSingle()`/`single()` resolve to the FIRST row rather than the array, because that is
 * what PostgREST does — and the attention feed reads `organization_settings` and
 * `org_monthly_overages` that way. A shared mock that handed back the array here would have let
 * "the workspace is paused" silently read as undefined and the test pass for the wrong reason.
 */
function fakeDb(tables: Record<string, unknown[]>, log: ChainCall[] = []) {
  return {
    from: (table: string) => {
      const present = table in tables;
      const rows = present ? tables[table] : null;
      const result = present
        ? { data: rows, error: null, count: rows!.length }
        : { data: null, error: { message: `relation "${table}" does not exist` } };
      const chain = makeChain(result, log) as Record<string, unknown>;
      const one = present
        ? { data: rows![0] ?? null, error: null }
        : { data: null, error: { message: `relation "${table}" does not exist` } };
      chain.maybeSingle = () => {
        log.push(["maybeSingle", []]);
        return Promise.resolve(one);
      };
      chain.single = () => {
        log.push(["single", []]);
        return Promise.resolve(one);
      };
      return chain;
    },
  } as never;
}

const LEAD = {
  id: "lead-1",
  name: "Anna Schmidt",
  phone: "+13215550123",
  email: "anna@example.com",
  source: "inbound_call",
  status: "new",
  notes: null,
  created_at: "2026-08-01T10:00:00Z",
  updated_at: "2026-08-20T10:00:00Z",
};

const TICKET = {
  id: "ticket-1",
  subject: "Broken tap in room 4",
  description: "Guest reported a leak.",
  status: "open",
  priority: "high",
  created_at: "2026-08-20T10:00:00Z",
  call_id: null,
  lead_id: "lead-1",
};

describe("searchPattern", () => {
  it("strips the characters that would end PostgREST's or= filter early", () => {
    // A comma would start a new filter term; parens would close the group.
    expect(searchPattern("anna,phone.ilike.*")).not.toContain(",");
    expect(searchPattern("a(b)c")).not.toContain("(");
    expect(searchPattern("a)b")).not.toContain(")");
  });

  it("strips ILIKE wildcards, so typed text cannot widen the match", () => {
    const p = searchPattern("%_*");
    // Only the wrapping wildcards survive — the typed ones are gone.
    expect(p).toBe("**");
  });

  it("wraps the cleaned text in wildcards", () => {
    expect(searchPattern("anna")).toBe("*anna*");
  });
});

describe("searchWorkspace", () => {
  it("does not run below the minimum length", async () => {
    const log: ChainCall[] = [];
    const db = fakeDb({ leads: [LEAD], tickets: [TICKET] }, log);
    const res = await searchWorkspace(ORG, USER, "a".repeat(SEARCH_MIN_LENGTH - 1), {}, db);

    expect(res.total).toBe(0);
    expect(log).toHaveLength(0); // not "found nothing" — never asked
  });

  it("returns nothing without an org, and never queries", async () => {
    const log: ChainCall[] = [];
    const db = fakeDb({ leads: [LEAD] }, log);
    const res = await searchWorkspace("", USER, "anna", {}, db);

    expect(res.total).toBe(0);
    expect(log).toHaveLength(0);
  });

  it("scopes every query to the org", async () => {
    const log: ChainCall[] = [];
    const db = fakeDb({ leads: [LEAD], tickets: [TICKET], appointments: [] }, log);
    await searchWorkspace(ORG, USER, "anna", {}, db);

    expect(hasOrgScope(log, ORG)).toBe(true);
    // Never scoped to some OTHER org — the filter is present and it is this org's.
    const wrongOrg = log.some(([m, a]) => m === "eq" && a[0] === "org_id" && a[1] !== ORG);
    expect(wrongOrg).toBe(false);
  });

  it("finds a contact by name and links to its page", async () => {
    const db = fakeDb({ leads: [LEAD] });
    const res = await searchWorkspace(ORG, USER, "anna", {}, db);

    expect(res.contacts).toHaveLength(1);
    expect(res.contacts[0].title).toBe("Anna Schmidt");
    expect(res.contacts[0].href).toBe("/dashboard/crm/contacts/lead-1");
    expect(res.contacts[0].subtitle).toContain("+13215550123");
  });

  it("still returns contacts when the requests tables are missing", async () => {
    const db = fakeDb({ leads: [LEAD] }); // no tickets, no appointments, no calls
    const res = await searchWorkspace(ORG, USER, "anna", {}, db);

    expect(res.contacts).toHaveLength(1);
    expect(res.requests).toHaveLength(0);
    expect(res.conversations).toHaveLength(0);
  });

  it("finds a request by its subject", async () => {
    const db = fakeDb({ tickets: [TICKET], appointments: [] });
    const res = await searchWorkspace(ORG, USER, "tap", {}, db);

    expect(res.requests).toHaveLength(1);
    expect(res.requests[0].title).toBe("Broken tap in room 4");
    expect(res.requests[0].meta).toBe("Ticket");
    expect(res.requests[0].href).toContain("/dashboard/crm/requests/ticket-1");
  });

  it("caps each group so the panel stays a shortcut", async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...LEAD, id: `lead-${i}` }));
    const db = fakeDb({ leads: many });
    const res = await searchWorkspace(ORG, USER, "anna", { groupSize: 3 }, db);

    expect(res.contacts.length).toBeLessThanOrEqual(3);
  });
});

describe("loadAttentionFeed", () => {
  it("is empty without an org", async () => {
    const feed = await loadAttentionFeed("", USER, fakeDb({}));
    expect(feed).toEqual({ items: [], count: 0 });
  });

  it("goes quiet — not loud — when every table is missing", async () => {
    const feed = await loadAttentionFeed(ORG, USER, fakeDb({}));
    expect(feed.items).toHaveLength(0);
    expect(feed.count).toBe(0);
  });

  it("raises a critical item when the workspace is paused, and links to billing", async () => {
    const db = fakeDb({
      organization_settings: [{ workspace_status: "paused", paused_reason: "hard_cap" }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);
    const paused = feed.items.find((i) => i.kind === "workspace_paused");

    expect(paused).toBeDefined();
    expect(paused?.severity).toBe("critical");
    expect(paused?.href).toBe("/dashboard/settings/workspace/billing");
    expect(paused?.body).toMatch(/minutes/i);
  });

  it("says nothing about an active workspace", async () => {
    const db = fakeDb({
      organization_settings: [{ workspace_status: "active", paused_reason: null }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);
    expect(feed.items.some((i) => i.kind === "workspace_paused")).toBe(false);
  });

  it("warns once, at the highest crossed usage threshold", async () => {
    const db = fakeDb({
      org_monthly_overages: [{ billable_minutes: 380, included_minutes: 400 }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);
    const usage = feed.items.filter((i) => i.kind === "usage");

    expect(usage).toHaveLength(1);
    expect(usage[0].title).toContain("90%");
    expect(usage[0].href).toBe("/dashboard/usage");
  });

  it("stays quiet below the 75% threshold", async () => {
    const db = fakeDb({
      org_monthly_overages: [{ billable_minutes: 210, included_minutes: 400 }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);
    expect(feed.items.some((i) => i.kind === "usage")).toBe(false);
  });

  it("says nothing about usage for an org with no included minutes", async () => {
    const db = fakeDb({ org_monthly_overages: [{ billable_minutes: 50, included_minutes: 0 }] });
    const feed = await loadAttentionFeed(ORG, USER, db);
    expect(feed.items.some((i) => i.kind === "usage")).toBe(false);
  });

  it("scopes its own queries to the org", async () => {
    const log: ChainCall[] = [];
    const db = fakeDb(
      { organization_settings: [{ workspace_status: "paused", paused_reason: null }] },
      log
    );
    await loadAttentionFeed(ORG, USER, db);
    expect(hasOrgScope(log, ORG)).toBe(true);
  });

  it("keeps the badge equal to the list", async () => {
    const db = fakeDb({
      organization_settings: [{ workspace_status: "paused", paused_reason: "past_due" }],
      org_monthly_overages: [{ billable_minutes: 400, included_minutes: 400 }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);
    expect(feed.count).toBe(feed.items.length);
  });

  it("gives every item a destination", async () => {
    const db = fakeDb({
      organization_settings: [{ workspace_status: "paused", paused_reason: "hard_cap" }],
      org_monthly_overages: [{ billable_minutes: 390, included_minutes: 400 }],
    });
    const feed = await loadAttentionFeed(ORG, USER, db);

    expect(feed.items.length).toBeGreaterThan(0);
    for (const item of feed.items) {
      expect(item.href.startsWith("/dashboard/")).toBe(true);
      expect(item.title.trim().length).toBeGreaterThan(0);
    }
  });
});
