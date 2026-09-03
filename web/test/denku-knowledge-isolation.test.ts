import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// `denku-agent/tools` reaches the service-role client at import time; nothing here touches a DB.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn(), rpc: vi.fn() } }));

import { DENKU_TOOL_IDS } from "@/lib/vapi/assistantConfig";
import { DENKU_SELF_ORG_ID, isDenkuSelfOrg } from "@/lib/denku-agent/tools";

/**
 * Denku's own sales knowledge must never reach a customer's AI.
 *
 * A plumber's assistant quoting Denku's price list to the plumber's callers is not a cosmetic
 * bug — it is the product telling a customer's customer about a different product. There are four
 * independent gates, and this file holds each of them, because they were not all working.
 *
 * **The one that was broken (found 2026-09-03):** the voice route's refusal was written as
 * `if (orgId && selfConfigured && !isDenkuSelfOrg(orgId))`, where `selfConfigured` required
 * `DENKU_SELF_ORG_ID` to be set in the environment. It is not set in production, so the check was
 * inert on the only deployment it mattered on — verified by calling the live route with a real
 * NOTUS call id and receiving Denku's corpus in full. The condition bought nothing, because
 * `isDenkuSelfOrg` carries a hardcoded fallback that is Denku's real org id.
 */

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

const NOT_DENKU = "a9022d05-b351-4769-92bb-23d1fb7dbf5b"; // NOTUS Uniform, a real customer workspace

describe("gate 1 — the tool is never merged into every assistant", () => {
  it("stays out of DENKU_TOOL_IDS", () => {
    // `ensureAssistantConfig` merges that list into EVERY assistant on every config path.
    expect(DENKU_TOOL_IDS).not.toContain("130b835d-69e0-49ca-a085-7943870692e3");
  });
});

describe("gate 2 — the voice route refuses a workspace that is not Denku", () => {
  const route = read("app/api/tools/search-denku/route.ts");

  it("does not make the refusal conditional on an environment variable", () => {
    // The regression. An unset variable must never be able to disable this check again.
    expect(route).not.toMatch(/selfConfigured/);
    expect(route).toMatch(/if \(orgId && !isDenkuSelfOrg\(orgId\)\)/);
  });

  it("resolves the workspace from headers only, never from the body", () => {
    expect(route).toMatch(/x-vapi-call-id/);
    expect(route).toMatch(/x-vapi-assistant-id/);
    expect(route).not.toMatch(/org_id:\s*z\./);
  });

  it("still serves a caller with no workspace at all", () => {
    // The landing-page visitor has no org, and refusing them would make the tool useless.
    expect(route).toMatch(/orgId &&/);
  });
});

describe("gate 3 and 4 — chat offers it, and executes it, only for Denku", () => {
  const tools = read("lib/platform/reply/tools.ts");

  it("offers the tool only to Denku's own workspace", () => {
    expect(tools).toMatch(/if \(isDenkuSelfOrg\(orgId\)\)/);
  });

  it("refuses to execute it for anyone else, even if the model asks", () => {
    expect(tools).toMatch(/if \(!isDenkuSelfOrg\(ctx\.orgId\)\)/);
  });
});

describe("the identity itself", () => {
  it("works with no environment variable set, because the fallback is the real org", () => {
    const previous = process.env.DENKU_SELF_ORG_ID;
    delete process.env.DENKU_SELF_ORG_ID;
    try {
      expect(isDenkuSelfOrg(DENKU_SELF_ORG_ID)).toBe(true);
      expect(isDenkuSelfOrg(NOT_DENKU)).toBe(false);
      expect(isDenkuSelfOrg(null)).toBe(false);
    } finally {
      if (previous !== undefined) process.env.DENKU_SELF_ORG_ID = previous;
    }
  });

  it("is an identity, not an entitlement — one workspace, not every internal one", () => {
    // `orgs.is_internal` marks workspaces Denku OPERATES and grants chat capacity. This names the
    // single one that IS Denku. Merging them would give every future demo workspace a sales agent.
    expect(DENKU_SELF_ORG_ID).toBe("286b7738-85e5-4d66-a08f-4d87f4f8f30c");
  });
});

describe("the shared chat prompt never carries Denku's own", () => {
  const engine = read("lib/platform/reply/engine.ts");

  it("builds Denku's core prompt only behind an explicit identity check", () => {
    expect(engine).toMatch(/isDenkuSelfOrg\(req\.employee\.orgId\)\s*\?\s*buildDenkuCorePrompt/);
  });
});
