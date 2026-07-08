import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { makeChain, hasOrgScope, type ChainCall } from "./helpers/supabaseMock";

/**
 * Tenant isolation in Denku rests entirely on a hand-written `.eq("org_id", …)` in
 * every service-role query — there is no RLS backstop (R-060). These tests are a
 * regression guard on that invariant across representative read / write / update
 * surfaces. They are a spot-check of the discipline, NOT exhaustive proof; the
 * durable fix is RLS + a scoped-query helper (R-060).
 */
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { rpc: vi.fn(), from: vi.fn() },
}));
vi.mock("@/lib/billing/limits", () => ({
  isWorkspacePaused: vi.fn(),
  getEffectiveLimits: vi.fn(),
}));
vi.mock("@/lib/organizations/plans", () => ({
  getOrgPlan: vi.fn(),
  getOrgConcurrencyLimit: vi.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getOrgActiveLeaseCount, releaseOrgConcurrencyLease } from "@/lib/concurrency/leases";
import { checkCallGuardrails } from "@/lib/guardrails/call-guardrails";

const rpc = supabaseAdmin.rpc as unknown as Mock;
const from = supabaseAdmin.from as unknown as Mock;

const ORG = "org-tenant-1";

beforeEach(() => {
  rpc.mockResolvedValue({ data: null, error: null });
});

describe("org scoping — reads", () => {
  it("getOrgActiveLeaseCount filters by org_id", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ count: 0, error: null }, log));
    await getOrgActiveLeaseCount(ORG);
    expect(hasOrgScope(log, ORG)).toBe(true);
  });
});

describe("org scoping — writes", () => {
  it("guardrail-forced ticket inserts carry the caller's org_id", async () => {
    const log: ChainCall[] = [];
    from
      .mockReturnValueOnce(makeChain({ data: null }, log)) // existence check
      .mockReturnValueOnce(makeChain({ data: { id: "t" }, error: null }, log)); // insert

    await checkCallGuardrails({
      callId: "call-1",
      orgId: ORG,
      transcript: "Agent: your phone number? Agent: your phone number again?",
      fromPhone: "+13215550123",
      toPhone: "+13215559999",
      rawPayload: {},
      userTurnCount: 2,
    });

    const insertCall = log.find(([m]) => m === "insert");
    expect(insertCall, "expected an insert to have occurred").toBeDefined();
    expect(insertCall?.[1][0]).toMatchObject({ org_id: ORG });
  });
});

describe("org scoping — updates", () => {
  it("lease release fallback update is scoped by org_id", async () => {
    // Force the RPC to error so the manual update fallback (which scopes by org_id) runs.
    rpc.mockResolvedValue({ error: { message: "rpc missing", code: "42883" } });
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ error: null }, log));

    await releaseOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" });

    expect(hasOrgScope(log, ORG)).toBe(true);
  });
});
