import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { makeChain, hasOrgScope, type ChainCall } from "./helpers/supabaseMock";

// The service-role client and its dependencies are mocked so no live DB is touched.
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
import { isWorkspacePaused, getEffectiveLimits } from "@/lib/billing/limits";
import {
  acquireOrgConcurrencyLease,
  releaseOrgConcurrencyLease,
  getOrgActiveLeaseCount,
} from "@/lib/concurrency/leases";

const rpc = supabaseAdmin.rpc as unknown as Mock;
const from = supabaseAdmin.from as unknown as Mock;
const paused = isWorkspacePaused as unknown as Mock;
const limits = getEffectiveLimits as unknown as Mock;

const ORG = "org-abc";

beforeEach(() => {
  // Sensible defaults: active workspace, a growth-tier limit of 4.
  paused.mockResolvedValue(false);
  limits.mockResolvedValue({ max_concurrent_calls: 4, plan_key: "growth", addons: [] });
});

describe("acquireOrgConcurrencyLease — characterization", () => {
  it("denies with org_inactive when the workspace is paused (pause overrides everything)", async () => {
    paused.mockResolvedValue(true);
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" });
    expect(res).toEqual({ ok: false, reason: "org_inactive", error: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled(); // short-circuits before the RPC
  });

  it("denies with org_inactive when the effective limit is <= 0", async () => {
    limits.mockResolvedValue({ max_concurrent_calls: 0, plan_key: null, addons: [] });
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" });
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ reason: "org_inactive" });
  });

  it("succeeds when the RPC grants the lease (returns active/limit counts)", async () => {
    rpc.mockResolvedValue({ data: [{ ok: true, active_count: 1, limit_value: 4 }], error: null });
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" });
    expect(res).toEqual({ ok: true, activeCount: 1, limitValue: 4 });
    expect(rpc).toHaveBeenCalledWith("acquire_org_concurrency_lease", {
      p_org_id: ORG,
      p_agent_id: null,
      p_vapi_call_id: "call-1",
      p_limit: 4,
      p_ttl_minutes: 15,
    });
  });

  it("rejects with limit_reached when the RPC returns ok=false (at the limit)", async () => {
    rpc.mockResolvedValue({ data: [{ ok: false, active_count: 4, limit_value: 4 }], error: null });
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-5" });
    expect(res).toEqual({
      ok: false,
      reason: "limit_reached",
      activeCount: 4,
      limitValue: 4,
      error: expect.any(String),
    });
  });

  it("returns rpc_no_row when the RPC yields no rows", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" });
    expect(res).toMatchObject({ ok: false, reason: "rpc_no_row", limitValue: 4 });
  });

  it("on RPC error, falls back to a manual count and rejects at the limit", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom", code: "XX000" } });
    // getOrgActiveLeaseCount → count query resolves 4, which is >= the limit of 4.
    from.mockReturnValue(makeChain({ count: 4, error: null }));
    const res = await acquireOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-5" });
    expect(res).toMatchObject({ ok: false, reason: "limit_reached", activeCount: 4, limitValue: 4 });
  });
});

describe("releaseOrgConcurrencyLease — characterization (idempotent)", () => {
  it("is a no-op when no vapiCallId is supplied", async () => {
    await expect(releaseOrgConcurrencyLease({ orgId: ORG })).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("releases via RPC and never throws; is safe to call twice", async () => {
    rpc.mockResolvedValue({ error: null });
    await expect(releaseOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" })).resolves.toBeUndefined();
    await expect(releaseOrgConcurrencyLease({ orgId: ORG, vapiCallId: "call-1" })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("release_org_concurrency_lease", {
      p_org_id: ORG,
      p_vapi_call_id: "call-1",
    });
  });
});

describe("getOrgActiveLeaseCount — org scoping", () => {
  it("scopes the active-lease count by org_id", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ count: 3, error: null }, log));
    const count = await getOrgActiveLeaseCount(ORG);
    expect(count).toBe(3);
    expect(hasOrgScope(log, ORG)).toBe(true);
  });

  it("returns 0 (never throws) on a query error", async () => {
    from.mockReturnValue(makeChain({ count: null, error: { message: "db down" } }));
    await expect(getOrgActiveLeaseCount(ORG)).resolves.toBe(0);
  });
});
