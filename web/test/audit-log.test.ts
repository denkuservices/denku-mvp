import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  AUDIT_CATEGORIES,
  auditToCsv,
  parseAuditFilters,
  type AuditEntry,
} from "@/lib/audit/read";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/**
 * File contents with comments stripped.
 *
 * These assertions are about what the code DOES, and several of these files explain in a comment
 * why a thing is absent — an explanation that necessarily names it. Matching raw source would make
 * the documentation fail the test.
 */
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The audit log.
 *
 * Three claims were untrue before this change: the page said it covered plan and member changes
 * while nothing on either path wrote a row; it was readable by any signed-in member; and it showed
 * twenty entries with no way to reach the twenty-first. These tests hold the first and third —
 * the second is covered by `workspace-permissions.test.ts`.
 */

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "a1",
    action: "billing.plan.change",
    entity_type: "billing.plan",
    entity_id: "org-1",
    created_at: "2026-09-01T10:00:00.000Z",
    actor_user_id: "u1",
    actor_email: "owner@example.com",
    actor_name: "Ada Lovelace",
    changes: [{ field: "plan_code", before_value: "starter", after_value: "growth" }],
    ...overrides,
  };
}

describe("filters come from the URL, and only well-formed ones survive", () => {
  it("keeps a known category and drops an invented one", () => {
    expect(parseAuditFilters({ category: "billing" }).category).toBe("billing");
    expect(parseAuditFilters({ category: "'; drop table" }).category).toBeUndefined();
  });

  it("keeps an actor id only when it looks like a uuid", () => {
    const uuid = "3f1a2b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
    expect(parseAuditFilters({ actor: uuid }).actorId).toBe(uuid);
    expect(parseAuditFilters({ actor: "someone" }).actorId).toBeUndefined();
  });

  it("keeps dates only in YYYY-MM-DD", () => {
    expect(parseAuditFilters({ from: "2026-09-01" }).from).toBe("2026-09-01");
    expect(parseAuditFilters({ from: "01/09/2026" }).from).toBeUndefined();
  });

  it("treats an empty search box as no filter at all", () => {
    expect(parseAuditFilters({ q: "   " }).q).toBeUndefined();
  });

  it("caps the search term so a huge string cannot be pushed into a query", () => {
    expect(parseAuditFilters({ q: "x".repeat(500) }).q?.length).toBe(120);
  });

  it("offers categories that match the action vocabulary", () => {
    // The categories are matched as an action PREFIX, so they have to be the first dotted segment
    // of the actions the product actually writes.
    const values = AUDIT_CATEGORIES.map((c) => c.value);
    expect(values).toContain("billing");
    expect(values).toContain("member");
    expect(values).toContain("workspace");
  });
});

describe("the CSV export", () => {
  it("writes one row per field changed", () => {
    const csv = auditToCsv([
      entry({
        changes: [
          { field: "plan_code", before_value: "starter", after_value: "growth" },
          { field: "seats", before_value: "1", after_value: "3" },
        ],
      }),
    ]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3); // header + two changes
    expect(lines[1]).toContain("plan_code");
    expect(lines[2]).toContain("seats");
  });

  it("still writes a row for an entry that changed no fields", () => {
    // A password change or a sign-out-everywhere records the event with no diff. Dropping those
    // rows would make the export quieter than the log it exports.
    const csv = auditToCsv([entry({ action: "security.password.change", changes: [] })]);
    expect(csv.split("\r\n")).toHaveLength(2);
    expect(csv).toContain("security.password.change");
  });

  it("quotes a value containing a comma so the columns do not shift", () => {
    const csv = auditToCsv([
      entry({ changes: [{ field: "name", before_value: "Acme, Inc", after_value: "Acme" }] }),
    ]);
    expect(csv).toContain('"Acme, Inc"');
  });

  it("escapes an embedded quote rather than breaking the cell", () => {
    const csv = auditToCsv([
      entry({ changes: [{ field: "name", before_value: 'The "Old" Shop', after_value: "Shop" }] }),
    ]);
    expect(csv).toContain('"The ""Old"" Shop"');
  });

  it("names the timestamp column as UTC, because it is", () => {
    // The values are raw ISO strings; a reader opening this in a spreadsheet has no other way to
    // know which zone they are in.
    expect(auditToCsv([entry()]).split("\r\n")[0]).toContain("timestamp_utc");
  });

  it("produces only a header for an empty result", () => {
    expect(auditToCsv([]).split("\r\n")).toHaveLength(1);
  });
});

/**
 * The page claimed to cover billing and member changes. Now something has to write those rows.
 */
describe("the actions the audit log claims to cover actually write to it", () => {
  const CASES: Array<[string, string]> = [
    ["app/api/billing/plan/change/route.ts", "billing.plan.change"],
    ["app/api/billing/addons/update/route.ts", "billing.addon."],
    ["app/api/members/invite/route.ts", "member.invite"],
    ["app/api/members/[memberId]/route.ts", "member.role.change"],
    ["app/api/members/invites/[inviteId]/route.ts", "member.invite.revoke"],
    ["app/api/members/transfer-ownership/route.ts", "workspace.ownership.transfer"],
  ];

  for (const [rel, action] of CASES) {
    it(`${rel} records ${action}`, () => {
      const source = read(rel);
      expect(source).toContain("logAuditEvent");
      expect(source).toContain(action);
    });
  }

  it("exporting the audit log is itself audited", () => {
    // Taking a copy of the record of every change belongs in the record of every change.
    expect(read("app/api/audit/export/route.ts")).toContain("security.audit.export");
  });
});

/**
 * The hydration bug. The list formatted timestamps with `Intl.DateTimeFormat` inside a component
 * that renders on both the server (UTC on Vercel) and the client (the reader's zone), so the two
 * renders disagreed and React tore the tree down on every direct load.
 */
describe("timestamps do not fight hydration", () => {
  it("the list renders time through the shared client-time component", () => {
    const source = readCode("app/(app)/dashboard/settings/workspace/audit/_components/AuditLogList.tsx");
    expect(source).toContain("RelativeTime");
    expect(source).not.toContain("new Intl.DateTimeFormat");
  });

  it("that component pins the pre-mount render to UTC", () => {
    const source = readCode("components/time/ClientTime.tsx");
    // The pre-mount branch formats with an explicit UTC zone so the server render and the first
    // client render produce byte-identical text.
    expect(source).toContain('formatAbsolute(iso, "UTC")');
    // suppressHydrationWarning would hide the mismatch instead of removing it.
    expect(source).not.toContain("suppressHydrationWarning");
  });
});
