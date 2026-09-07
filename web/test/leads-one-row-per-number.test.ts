import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { makeChain, type ChainCall } from "./helpers/supabaseMock";

/**
 * One caller is one customer.
 *
 * A single phone number produced **266 lead rows** on the first Turkish workspace, several
 * wearing different names, the rest anonymous — a CRM in which the same person appears hundreds
 * of times is worse than no CRM, because the owner cannot tell a repeat caller from a new one.
 *
 * Two bugs compounded. The select-then-insert had no unique key under it, so overlapping webhook
 * events for one call both inserted. That made twins. What made hundreds is that the lookup used
 * `.maybeSingle()`, which ERRORS on more than one match rather than returning the first — so once
 * a number had two rows, every later lookup failed, fell through to the insert branch, and added
 * another. The bug's only input was its own output.
 *
 * These tests pin both halves, because fixing only the race would leave the amplifier in place.
 */

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLeadIdByPhone } from "@/lib/leads/resolveLead";

const from = supabaseAdmin.from as unknown as Mock;

beforeEach(() => {
  from.mockReset();
});

const ORG = "11111111-1111-1111-1111-111111111111";
const PHONE = "+905425615772";

describe("resolveLeadIdByPhone", () => {
  it("returns the existing lead without inserting anything", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ data: { id: "lead-1" }, error: null }, log));

    const id = await resolveLeadIdByPhone(ORG, PHONE);

    expect(id).toBe("lead-1");
    expect(log.some(([m]) => m === "insert" || m === "upsert")).toBe(false);
  });

  it("never uses a bare maybeSingle for the lookup — it takes the first of N rows", async () => {
    // The amplifier. `.maybeSingle()` alone raises PGRST116 on multiple rows; with `.limit(1)`
    // the same duplicated data resolves to a row instead of driving another insert.
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ data: { id: "lead-1" }, error: null }, log));

    await resolveLeadIdByPhone(ORG, PHONE);

    expect(log).toContainEqual(["limit", [1]]);
    expect(log.some(([m, args]) => m === "order" && args[0] === "created_at")).toBe(true);
  });

  it("scopes every lookup to the org", async () => {
    const log: ChainCall[] = [];
    from.mockReturnValue(makeChain({ data: { id: "lead-1" }, error: null }, log));

    await resolveLeadIdByPhone(ORG, PHONE);

    expect(log.some(([m, args]) => m === "eq" && args[0] === "org_id" && args[1] === ORG)).toBe(true);
  });

  it("creates the lead when the number is new, on the natural key", async () => {
    const log: ChainCall[] = [];
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      // 1st: lookup misses. 2nd: the insert wins.
      return makeChain(
        call === 1 ? { data: null, error: null } : { data: { id: "lead-new" }, error: null },
        log
      );
    });

    const id = await resolveLeadIdByPhone(ORG, PHONE, { source: "vapi" });

    expect(id).toBe("lead-new");
    const upsert = log.find(([m]) => m === "upsert");
    expect(upsert).toBeDefined();
    const [, args] = upsert!;
    expect((args[1] as { onConflict: string }).onConflict).toBe("org_id,phone");
  });

  /**
   * The race. Two webhook events for the same call resolve a lead at the same moment; the unique
   * index makes the loser's insert a conflict, and the loser must adopt the winner's row rather
   * than report failure or try again.
   */
  it("adopts the winner's row when it loses the insert race", async () => {
    const log: ChainCall[] = [];
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      // 1st: lookup misses. 2nd: insert conflicts, returns nothing. 3rd: re-read finds the winner.
      if (call === 1) return makeChain({ data: null, error: null }, log);
      if (call === 2) return makeChain({ data: null, error: null }, log);
      return makeChain({ data: { id: "lead-winner" }, error: null }, log);
    });

    const id = await resolveLeadIdByPhone(ORG, PHONE);

    expect(id).toBe("lead-winner");
  });

  it("never overwrites an existing lead on conflict", async () => {
    // DO NOTHING, not DO UPDATE: the caller is usually holding nulls for name and email, and the
    // row that already exists may have learned a name. `fillMissingLeadName` is the only thing
    // allowed to write one, and only into an empty field.
    const log: ChainCall[] = [];
    let call = 0;
    from.mockImplementation(() => {
      call += 1;
      return makeChain(
        call === 1 ? { data: null, error: null } : { data: { id: "x" }, error: null },
        log
      );
    });

    await resolveLeadIdByPhone(ORG, PHONE);

    const [, args] = log.find(([m]) => m === "upsert")!;
    expect((args[1] as { ignoreDuplicates: boolean }).ignoreDuplicates).toBe(true);
  });

  it("returns null rather than throwing, so a call never dead-ends on bookkeeping", async () => {
    from.mockImplementation(() => {
      throw new Error("database on fire");
    });

    await expect(resolveLeadIdByPhone(ORG, PHONE)).resolves.toBeNull();
  });

  it("does nothing without an org or a number", async () => {
    expect(await resolveLeadIdByPhone(ORG, null)).toBeNull();
    expect(await resolveLeadIdByPhone("", PHONE)).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
