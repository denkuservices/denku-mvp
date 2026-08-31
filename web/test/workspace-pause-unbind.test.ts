import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { makeChain, hasOrgScope, type ChainCall } from "./helpers/supabaseMock";

/**
 * WORKSPACE PAUSE MUST STOP EVERY LINE — regression guard.
 *
 * Pausing a workspace is real enforcement, not a UI state: it PATCHes each Vapi phone number
 * to `assistantId: null`, which is the ONLY thing that stops inbound calls. That sweep
 * (`unbindOrgPhoneNumbers`) finds lines by querying `agents` for rows carrying BOTH
 * `vapi_assistant_id` AND `vapi_phone_number_id`.
 *
 * The bug these tests lock down: `/api/phone-lines/purchase` created a backing agent and then
 * wrote the Vapi number id only onto `phone_lines`, never onto the agent. Every purchased
 * extra line was therefore invisible to the sweep and KEPT ANSWERING on a paused workspace —
 * including a workspace paused for `hard_cap` or `past_due`. The fix is
 * `linkAgentToPhoneNumber` (called by the purchase route and `runActivation`) plus the
 * backfill in `supabase/migrations/20260829130000_backfill_agent_phone_number_link.sql`.
 *
 * So there are two things to protect: the link write itself, and the sweep's promise that it
 * unbinds *every* line it is given and refuses to report success when one fails.
 */

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("@/lib/vapi/server", () => ({ vapiFetch: vi.fn() }));
vi.mock("@/lib/billing/limits", () => ({
  isWorkspacePaused: vi.fn(),
  getEffectiveLimits: vi.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { linkAgentToPhoneNumber } from "@/lib/vapi/agentPhoneLink";
import { unbindOrgPhoneNumbers } from "@/lib/vapi/phoneNumberBinding";

const from = supabaseAdmin.from as unknown as Mock;
const fetchVapi = vapiFetch as unknown as Mock;

const ORG = "org-pause-1";

/** PATCH calls Vapi received, as [path, parsedBody] pairs. */
function patchCalls(): Array<[string, Record<string, unknown>]> {
  return fetchVapi.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PATCH")
    .map(([path, init]) => [
      path as string,
      JSON.parse((init as RequestInit).body as string) as Record<string, unknown>,
    ]);
}

beforeEach(() => {
  fetchVapi.mockReset();
  from.mockReset();
});

describe("linkAgentToPhoneNumber — the write pause enforcement depends on", () => {
  it("sets vapi_phone_number_id on the agent, scoped to the org", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ error: null }, log));

    const result = await linkAgentToPhoneNumber({
      orgId: ORG,
      agentId: "agent-1",
      vapiPhoneNumberId: "vapi-num-1",
    });

    expect(result.ok).toBe(true);
    const update = log.find(([m]) => m === "update");
    expect(update).toBeTruthy();
    expect((update![1][0] as Record<string, unknown>).vapi_phone_number_id).toBe("vapi-num-1");
    // No RLS backstop on the service-role client — the org filter is the tenant boundary.
    expect(hasOrgScope(log, ORG)).toBe(true);
    expect(log.some(([m, args]) => m === "eq" && args[0] === "id" && args[1] === "agent-1")).toBe(true);
  });

  it("never throws on a DB error — a paid purchase must not roll back over this write", async () => {
    from.mockReturnValue(makeChain({ error: { message: "duplicate key", code: "23505" } }));

    const result = await linkAgentToPhoneNumber({
      orgId: ORG,
      agentId: "agent-1",
      vapiPhoneNumberId: "vapi-num-1",
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("duplicate key");
  });

  it("refuses an incomplete link instead of writing a partial row", async () => {
    const result = await linkAgentToPhoneNumber({
      orgId: ORG,
      agentId: "agent-1",
      vapiPhoneNumberId: "",
    });

    expect(result.ok).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });
});

describe("unbindOrgPhoneNumbers — every line stops answering, not just the first", () => {
  it("unbinds the onboarding main line AND every purchased extra line", async () => {
    // Both rows carry a number id — which is exactly what the purchase fix + backfill
    // guarantee. Before them, only the main line appeared here.
    const agents = [
      { id: "agent-main", vapi_assistant_id: "asst-main", vapi_phone_number_id: "num-main" },
      { id: "agent-line-2", vapi_assistant_id: "asst-2", vapi_phone_number_id: "num-2" },
      { id: "agent-line-3", vapi_assistant_id: "asst-3", vapi_phone_number_id: "num-3" },
    ];
    const log: ChainCall[] = [];
    from
      .mockReturnValueOnce(makeChain({ data: agents, error: null }, log))
      .mockReturnValue(makeChain({ error: null }, log));
    fetchVapi.mockResolvedValue({ assistantId: "asst-main" });

    await unbindOrgPhoneNumbers(ORG, "hard_cap");

    const patches = patchCalls();
    expect(patches.map(([path]) => path)).toEqual([
      "/phone-number/num-main",
      "/phone-number/num-2",
      "/phone-number/num-3",
    ]);
    // assistantId: null is the unbind — anything else leaves the line answering.
    for (const [, body] of patches) expect(body.assistantId).toBeNull();
    expect(hasOrgScope(log, ORG)).toBe(true);
  });

  it("throws when any line fails to unbind — callers rely on that to not report a pause", async () => {
    const agents = [
      { id: "agent-main", vapi_assistant_id: "asst-main", vapi_phone_number_id: "num-main" },
      { id: "agent-line-2", vapi_assistant_id: "asst-2", vapi_phone_number_id: "num-2" },
    ];
    from
      .mockReturnValueOnce(makeChain({ data: agents, error: null }))
      .mockReturnValue(makeChain({ error: null }));

    fetchVapi.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === "PATCH" && path === "/phone-number/num-2") {
        return Promise.reject(new Error("Vapi error 500: boom"));
      }
      return Promise.resolve({ assistantId: "asst-main" });
    });

    await expect(unbindOrgPhoneNumbers(ORG, "past_due")).rejects.toThrow(/num-2/);
    // The healthy line was still unbound — a partial failure must not skip the rest.
    expect(patchCalls().map(([path]) => path)).toContain("/phone-number/num-main");
  });

  it("skips agents with no number id rather than crashing (pre-backfill rows)", async () => {
    const agents = [
      { id: "agent-main", vapi_assistant_id: "asst-main", vapi_phone_number_id: "num-main" },
      { id: "agent-unlinked", vapi_assistant_id: "asst-x", vapi_phone_number_id: null },
    ];
    from
      .mockReturnValueOnce(makeChain({ data: agents, error: null }))
      .mockReturnValue(makeChain({ error: null }));
    fetchVapi.mockResolvedValue({ assistantId: "asst-main" });

    await unbindOrgPhoneNumbers(ORG, "manual");

    expect(patchCalls().map(([path]) => path)).toEqual(["/phone-number/num-main"]);
  });
});
