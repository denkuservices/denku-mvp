import { describe, it, expect, vi, type Mock } from "vitest";
import { makeChain, didInsert, type ChainCall } from "./helpers/supabaseMock";

/**
 * Characterizes the Vapi webhook's deterministic-artifact IDEMPOTENCY mechanism as
 * it exists today, without refactoring the 3,100-line route (sprint constraint).
 *
 * The webhook's idempotency contract (skills/vapi-integration.md) is: "every write
 * must either upsert on vapi_call_id or check-then-insert on call_id." The
 * check-then-insert-on-call_id half lives in the guardrail artifact path
 * (`ensureTicketForCall` inside `checkCallGuardrails`), which IS importable — so we
 * lock in its behavior here: a repeated event never creates a duplicate ticket, and
 * the guardrail decision is deterministic (same input → same output).
 *
 * NOT covered here (documented limitation): the calls-table upsert-on-vapi_call_id in
 * route.ts. That is verified structurally by code reading; an integration test awaits
 * webhook testability work (R-043/R-074), out of scope this sprint.
 */
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkCallGuardrails } from "@/lib/guardrails/call-guardrails";

const from = supabaseAdmin.from as unknown as Mock;

const ORG = "org-xyz";
const CALL = "call-123";
// Transcript that asks for the phone slot twice → triggers GR-1 (repeat slot).
const REPEAT_PHONE_TRANSCRIPT =
  "Agent: What is your phone number? User: Sure. Agent: Sorry, your phone number again?";

function baseOpts(overrides: Partial<Parameters<typeof checkCallGuardrails>[0]> = {}) {
  return {
    callId: CALL,
    orgId: ORG,
    transcript: REPEAT_PHONE_TRANSCRIPT,
    fromPhone: "+13215550123",
    toPhone: "+13215559999",
    rawPayload: {},
    userTurnCount: 2,
    ...overrides,
  };
}

describe("webhook artifact idempotency — checkCallGuardrails", () => {
  it("does NOT insert a second ticket when one already exists for the call (idempotent)", async () => {
    const log: ChainCall[] = [];
    // The existence check finds a ticket → ensureTicketForCall returns early.
    from.mockReturnValue(makeChain({ data: { id: "existing-ticket" } }, log));

    const res = await checkCallGuardrails(baseOpts());

    expect(res).toEqual({ forceTicket: true, setPartial: true, reason: "repeat_slot_phone" });
    expect(didInsert(log)).toBe(false); // no duplicate write
  });

  it("inserts exactly one org-scoped ticket when none exists yet", async () => {
    const log: ChainCall[] = [];
    from
      .mockReturnValueOnce(makeChain({ data: null }, log)) // existence check → none
      .mockReturnValueOnce(makeChain({ data: { id: "new-ticket" }, error: null }, log)); // insert

    const res = await checkCallGuardrails(baseOpts());

    expect(res.forceTicket).toBe(true);
    expect(didInsert(log)).toBe(true);
    const insertCall = log.find(([m]) => m === "insert");
    expect(insertCall?.[1][0]).toMatchObject({ org_id: ORG, call_id: CALL });
  });

  it("is deterministic: identical input yields the identical decision", async () => {
    const benign = baseOpts({ transcript: "Hello, how can I help you today? Thanks, goodbye." });
    const a = await checkCallGuardrails(benign);
    const b = await checkCallGuardrails(benign);
    expect(a).toEqual({ forceTicket: false, setPartial: false });
    expect(b).toEqual(a);
    expect(from).not.toHaveBeenCalled(); // no artifact path when nothing triggers
  });

  it("never throws: swallows a failed ticket insert and still reports the guardrail decision", async () => {
    from
      .mockReturnValueOnce(makeChain({ data: null })) // existence check → none
      .mockReturnValueOnce(makeChain({ data: null, error: { message: "insert failed", code: "XX" } })) // insert errors
      .mockReturnValueOnce(makeChain({ data: null })); // race re-check → still none
    const res = await checkCallGuardrails(baseOpts());
    expect(res.forceTicket).toBe(true); // decision preserved despite the write failure
  });

  it("triggers on loop-cap when user turns exceed the max (deterministic artifact path)", async () => {
    const log: ChainCall[] = [];
    from
      .mockReturnValueOnce(makeChain({ data: null }, log))
      .mockReturnValueOnce(makeChain({ data: { id: "t" }, error: null }, log));
    const res = await checkCallGuardrails(
      baseOpts({ transcript: "just a normal chat with no slot words", userTurnCount: 13 })
    );
    expect(res).toMatchObject({ forceTicket: true, setPartial: true, reason: "loop_cap_turns" });
  });
});

describe("known R-053 misfire — characterization ONLY (locks current buggy behavior)", () => {
  it("counts phone vocabulary across BOTH speakers, so a healthy exchange still triggers GR-1", async () => {
    // Caller volunteering their number + agent asking once = 2 matches → wrongly triggered.
    // This encodes R-053's known-wrong behavior; when R-053 is fixed, update this test on purpose.
    from.mockReturnValue(makeChain({ data: { id: "t" } }));
    const res = await checkCallGuardrails(
      baseOpts({
        transcript: "Agent: What's your phone number? User: My phone number is 555-0123.",
      })
    );
    expect(res).toMatchObject({ forceTicket: true, reason: "repeat_slot_phone" });
  });
});
