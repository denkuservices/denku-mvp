import { describe, it, expect } from "vitest";
import {
  PLAN_PRICING,
  billableMinutesForCall,
  billableMinutesForCalls,
  overageMinutes,
  estimatedOverageCostUsd,
  estimatedTotalDueUsd,
} from "@/lib/billing/usageMath";

/**
 * Golden-master boundary tests for the billing math (R-075), mirroring the SQL
 * views. These lock the per-call ceil rule and the overage/total formulas so a
 * change to what customers are charged can't slip through unreviewed.
 */
describe("billableMinutesForCall — per-call ceil(seconds/60)", () => {
  it.each([
    [0, 0],
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [120, 2],
    [121, 3],
    [600, 10],
  ])("%i seconds → %i billable minutes", (seconds, expected) => {
    expect(billableMinutesForCall(seconds)).toBe(expected);
  });

  it("treats null/undefined/negative as 0", () => {
    expect(billableMinutesForCall(null)).toBe(0);
    expect(billableMinutesForCall(undefined)).toBe(0);
    expect(billableMinutesForCall(-5)).toBe(0);
  });
});

describe("billableMinutesForCalls — ceil is PER call, not on the total", () => {
  it("three 10-second calls bill 3 minutes (not 1)", () => {
    // Summing seconds first (30s → 1 min) would UNDER-bill; the SQL ceils per call.
    expect(billableMinutesForCalls([10, 10, 10])).toBe(3);
  });

  it("mixed durations sum their per-call ceilings", () => {
    // 61→2, 59→1, 600→10, null→0  ⇒ 13
    expect(billableMinutesForCalls([61, 59, 600, null])).toBe(13);
  });
});

describe("overage + totals per plan", () => {
  it("no overage at/under included minutes → total is just the monthly fee", () => {
    const p = PLAN_PRICING.starter; // 400 incl, $149
    expect(overageMinutes(400, p.includedMinutes)).toBe(0);
    expect(estimatedOverageCostUsd(400, p)).toBe(0);
    expect(estimatedTotalDueUsd(400, p)).toBe(149);
  });

  it("starter overage: 450 billable → 50 over × $0.22 = $11 → total $160", () => {
    const p = PLAN_PRICING.starter;
    expect(overageMinutes(450, p.includedMinutes)).toBe(50);
    expect(estimatedOverageCostUsd(450, p)).toBe(11);
    expect(estimatedTotalDueUsd(450, p)).toBe(160);
  });

  it("scale overage rounds to 2dp: 3607 billable → 7 over × $0.13 = $0.91", () => {
    const p = PLAN_PRICING.scale; // 3600 incl, $899, 0.13
    expect(estimatedOverageCostUsd(3607, p)).toBe(0.91);
    expect(estimatedTotalDueUsd(3607, p)).toBe(899.91);
  });

  it("plan constants match the non-negotiable pricing (CLAUDE.md)", () => {
    expect(PLAN_PRICING.starter).toMatchObject({ monthlyFeeUsd: 149, includedMinutes: 400, overageRateUsdPerMin: 0.22, concurrencyLimit: 1 });
    expect(PLAN_PRICING.growth).toMatchObject({ monthlyFeeUsd: 399, includedMinutes: 1200, overageRateUsdPerMin: 0.18, concurrencyLimit: 4 });
    expect(PLAN_PRICING.scale).toMatchObject({ monthlyFeeUsd: 899, includedMinutes: 3600, overageRateUsdPerMin: 0.13, concurrencyLimit: 10 });
  });
});
