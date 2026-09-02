import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The shape contract between a Vapi tool and the route it calls.
 *
 * This is a source-level test on purpose. The bug it guards is not a logic bug — the handler was
 * correct — it was a **vocabulary mismatch**: the live `create_ticket` tool sends the call id as a
 * header and a body of `notes`/`lead_*`, while the route demanded `call_id` and `description` in
 * the body. Every real invocation failed validation, and nobody noticed for months because
 * `ensureTicketForCall` in the webhook creates a ticket anyway.
 *
 * Nothing that runs in CI can talk to Vapi, so what is enforced here is that the route keeps
 * ACCEPTING both vocabularies. If someone tightens the schema back to a single spelling, this
 * fails and says why.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

describe("create-ticket accepts what Vapi actually sends", () => {
  const route = read("app/api/tools/create-ticket/route.ts");

  it("takes the call id from the x-vapi-call-id header, not only the body", () => {
    expect(route).toMatch(/x-vapi-call-id/);
  });

  it("looks the call up by vapi_call_id as well as by id", () => {
    // The second half of the bug: even a valid body was queried against the wrong column.
    expect(route).toMatch(/\.eq\("vapi_call_id", vapiCallId\)/);
  });

  it("accepts the lead_* and notes spellings the live tool uses", () => {
    for (const field of ["lead_phone", "lead_email", "lead_name", "notes"]) {
      expect(route).toContain(field);
    }
  });

  it("normalizes both vocabularies to one before the handler uses them", () => {
    expect(route).toMatch(/description: raw\.description \?\? raw\.notes/);
    expect(route).toMatch(/requester_phone: raw\.requester_phone \?\? raw\.lead_phone/);
  });

  it("treats Vapi's empty-string padding as absent", () => {
    // A declared-but-unfilled property arrives as "". Requiring a non-empty string there is what
    // rejected the first real appointment in production.
    expect(route).toMatch(/const optionalText = z\.preprocess/);
  });

  it("requires nothing in the body that Vapi does not send", () => {
    // `call_id` and `description` were the two required fields. Neither may be required again.
    expect(route).not.toMatch(/call_id:\s*z\.string\(\)\.uuid\(\)/);
    expect(route).not.toMatch(/description:\s*z\.string\(\)\.min\(1\)/);
  });

  it("still refuses to write a ticket that says nothing", () => {
    // Accepting everything must not become accepting nothing: a row with no description is a
    // ticket the team learns nothing from.
    expect(route).toMatch(/DESCRIPTION_REQUIRED/);
  });
});

describe("create-appointment already had the contract, and keeps it", () => {
  const route = read("app/api/tools/create-appointment/route.ts");

  it("reads the header and tolerates empty strings", () => {
    expect(route).toMatch(/x-vapi-call-id/);
    expect(route).toMatch(/const optionalText = z\.preprocess/);
  });
});

describe("find-product follows the same contract", () => {
  const route = read("app/api/tools/find-product/route.ts");

  it("reads the call id from the header and ignores an unresolved template", () => {
    expect(route).toMatch(/x-vapi-call-id/);
    expect(route).toMatch(/includes\("\{\{"\)/);
  });

  it("can resolve the workspace from the assistant when no call row exists yet", () => {
    expect(route).toMatch(/x-vapi-assistant-id/);
    expect(route).toMatch(/vapi_assistant_id/);
  });

  it("never reads an org id out of the body", () => {
    expect(route).not.toMatch(/org_id:\s*z\./);
  });
});
