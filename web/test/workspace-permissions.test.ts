import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// `permissions.ts` pulls in the service-role client and `next/headers` at module load. This suite
// exercises the pure matrix, so both are stubbed rather than configured.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

import {
  ROLES,
  capabilitiesFor,
  denialCopy,
  isRole,
  roleCan,
  type Capability,
} from "@/lib/auth/permissions";

const SRC = path.join(process.cwd(), "src");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/**
 * Who may do what.
 *
 * The audit that produced this module found two live holes: any signed-in member — a `viewer`
 * included — could change the plan, buy add-ons and open the Stripe portal; and an `admin` could
 * mint a second `owner`. Both are asserted here as rules rather than as implementation details,
 * because the failure mode is silent: nothing errors when an authorization check is missing, it
 * just works for the wrong person.
 */

describe("the role vocabulary", () => {
  it("is exactly owner, admin and viewer", () => {
    expect([...ROLES]).toEqual(["owner", "admin", "viewer"]);
  });

  it("does not accept an unknown string as a role", () => {
    // Fail closed: a typo in `profiles.role` must read as "no role", never as a role.
    expect(isRole("Owner")).toBe(false);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(roleCan(null, "view_workspace")).toBe(false);
  });
});

describe("billing is not something everyone can do", () => {
  it("refuses a viewer", () => {
    // The P0: a viewer could move a workspace from $149 to $899.
    expect(roleCan("viewer", "manage_billing")).toBe(false);
  });

  it("allows owners and admins", () => {
    expect(roleCan("owner", "manage_billing")).toBe(true);
    expect(roleCan("admin", "manage_billing")).toBe(true);
  });
});

describe("ownership is owner-only", () => {
  it("refuses an admin", () => {
    // An admin who could grant `owner` could grant themselves everything `admin` was withheld.
    expect(roleCan("admin", "grant_owner")).toBe(false);
    expect(roleCan("viewer", "grant_owner")).toBe(false);
  });

  it("allows the owner", () => {
    expect(roleCan("owner", "grant_owner")).toBe(true);
  });

  it("keeps workspace deletion owner-only too", () => {
    expect(roleCan("admin", "delete_workspace")).toBe(false);
    expect(roleCan("owner", "delete_workspace")).toBe(true);
  });
});

describe("a viewer can see, and change nothing", () => {
  const caps = capabilitiesFor("viewer");

  it("can view the workspace", () => {
    expect(caps.view_workspace).toBe(true);
  });

  it("holds no other capability at all", () => {
    const granted = (Object.keys(caps) as Capability[]).filter((k) => caps[k]);
    expect(granted).toEqual(["view_workspace"]);
  });

  it("cannot read the audit log", () => {
    // It names people and the decisions they took.
    expect(roleCan("viewer", "view_audit_log")).toBe(false);
  });
});

describe("every refusal says something a person can act on", () => {
  it("never returns a bare 'Forbidden'", () => {
    for (const cap of Object.keys(capabilitiesFor("owner")) as Capability[]) {
      const copy = denialCopy(cap);
      expect(copy.length).toBeGreaterThan(20);
      expect(copy.toLowerCase()).not.toBe("forbidden");
    }
  });

  it("names the role that would be needed", () => {
    expect(denialCopy("manage_billing")).toMatch(/owner/i);
    expect(denialCopy("grant_owner")).toMatch(/owner/i);
  });
});

/**
 * The routes that spend money must actually consult the matrix.
 *
 * A unit test of `roleCan` proves the rule exists; it does not prove anyone asked. These check the
 * call sites, because that is precisely where the bug was — the rule was never missing, it was
 * never invoked.
 */
describe("the money routes are gated", () => {
  const MONEY_ROUTES = [
    "app/api/billing/plan/change/route.ts",
    "app/api/billing/addons/update/route.ts",
    "app/api/billing/stripe/portal/route.ts",
    "app/api/billing/stripe/checkout/route.ts",
    "app/api/phone-lines/purchase/route.ts",
  ];

  for (const rel of MONEY_ROUTES) {
    it(`${rel} asks for manage_billing`, () => {
      const source = read(rel);
      expect(source).toContain('guard("manage_billing")');
    });
  }

  it("the member routes ask for manage_members", () => {
    expect(read("app/api/members/invite/route.ts")).toContain('guard("manage_members")');
    expect(read("app/api/members/[memberId]/route.ts")).toContain('guard("manage_members")');
    expect(read("app/api/members/invites/[inviteId]/route.ts")).toContain('guard("manage_members")');
  });

  it("ownership transfer asks for grant_owner", () => {
    expect(read("app/api/members/transfer-ownership/route.ts")).toContain('guard("grant_owner")');
  });

  it("the audit export asks for view_audit_log", () => {
    expect(read("app/api/audit/export/route.ts")).toContain('guard("view_audit_log")');
  });
});
