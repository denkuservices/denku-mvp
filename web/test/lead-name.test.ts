import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanLeadName } from "@/lib/leads/name";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Contacts have names (2026-08-27).
 *
 * A caller said "My name is Gaye"; the Inbox said "Unknown contact". The name was in the booking
 * tool's payload the whole time — the lead already existed (the webhook creates it from caller ID
 * before anyone speaks), so both tool routes took their "found it" branch and dropped it.
 */
describe("cleanLeadName", () => {
  it("keeps a real name and tidies its spacing", () => {
    expect(cleanLeadName("  Gaye   Yilmaz ")).toBe("Gaye Yilmaz");
  });

  it("rejects the placeholders a model invents for a required field", () => {
    for (const junk of ["unknown", "Unknown Caller", "customer", "N/A", "none", "guest", "test"]) {
      expect(cleanLeadName(junk)).toBeNull();
    }
  });

  it("rejects things that are not names", () => {
    expect(cleanLeadName("")).toBeNull();
    expect(cleanLeadName(null)).toBeNull();
    expect(cleanLeadName("A")).toBeNull(); // too short to be worth storing
    expect(cleanLeadName("3213311234")).toBeNull(); // a spoken phone number, not a name
    expect(cleanLeadName("x".repeat(200))).toBeNull();
  });

  it("accepts non-ASCII names", () => {
    expect(cleanLeadName("Gökçe")).toBe("Gökçe");
    expect(cleanLeadName("李伟")).toBe("李伟");
  });
});

describe("the AI fills a name in but never overwrites one", () => {
  const lib = read("src/lib/leads/fillMissingName.ts");
  const pure = read("src/lib/leads/name.ts");

  it("updates only while the name is still empty", () => {
    // This conditional UPDATE is what makes an owner's correction permanent.
    expect(lib).toMatch(/\.is\("name", null\)/);
    expect(lib).toMatch(/\.eq\("org_id", orgId\)/);
  });

  it("never throws — it runs inside artifact creation, which must not dead-end", () => {
    expect(lib).toMatch(/try \{/);
    expect(lib).toMatch(/catch \(err\)/);
  });

  it("is called from both tool routes on the branch that used to drop the name", () => {
    const appt = read("src/app/api/tools/create-appointment/route.ts");
    expect(appt).toMatch(/fillMissingLeadName\(org\.id, leadId, input\.lead_name \?\? null\)/);

    const ticket = read("src/app/api/tools/create-ticket/route.ts");
    // Both resolve branches: by phone and by email.
    expect(ticket.match(/fillMissingLeadName\(orgId, existing\.id, name\)/g)).toHaveLength(2);
  });
});

describe("the owner can correct the spelling", () => {
  const actions = read("src/app/(app)/dashboard/crm/_actions.ts");

  it("scopes the write to the caller's own org", () => {
    expect(actions).toMatch(/setContactNameAction/);
    expect(actions).toMatch(/\.eq\("org_id", auth\.orgId\)/);
  });

  it("clearing the field re-arms the AI rather than storing an empty string", () => {
    expect(actions).toMatch(/trimmed\.length === 0 \? null : cleanLeadName\(trimmed\)/);
  });

  it("is reachable from the contact page", () => {
    const page = read("src/app/(app)/dashboard/crm/contacts/[contactId]/page.tsx");
    expect(page).toMatch(/<NameControl/);
  });
});
