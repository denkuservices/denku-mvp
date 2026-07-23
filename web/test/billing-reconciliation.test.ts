import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/observability/logEvent", () => ({ logEvent: vi.fn() }));

import { computeMargin, classifyMargin, THIN_MARGIN_PCT } from "@/lib/billing/reconciliation";

describe("computeMargin (R-076)", () => {
  it("computes margin USD and %", () => {
    expect(computeMargin(160, 40)).toEqual({ marginUsd: 120, marginPct: 75 });
    expect(computeMargin(149, 149)).toEqual({ marginUsd: 0, marginPct: 0 });
  });

  it("handles negative margin (COGS > revenue)", () => {
    const m = computeMargin(100, 130);
    expect(m.marginUsd).toBe(-30);
    expect(m.marginPct).toBe(-30);
  });

  it("guards zero revenue", () => {
    expect(computeMargin(0, 0)).toEqual({ marginUsd: 0, marginPct: 0 });
  });
});

describe("classifyMargin", () => {
  it("flags negative margin", () => {
    expect(classifyMargin(-5, -10)).toBe("negative");
  });

  it("flags thin margin below the threshold", () => {
    expect(classifyMargin(10, THIN_MARGIN_PCT - 1)).toBe("thin");
  });

  it("passes healthy margins", () => {
    expect(classifyMargin(100, 80)).toBe("ok");
    expect(classifyMargin(10, THIN_MARGIN_PCT)).toBe("ok");
  });
});
