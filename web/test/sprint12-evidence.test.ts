import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import {
  ANALYTICS_RANGES,
  resolveRange,
  aggregateByHour,
  splitByPeriod,
} from "@/lib/platform/readModel/aggregate";
import { computeSavings, HUMAN_AGENT_HOURLY_RATE } from "@/lib/platform/readModel/savings";
import { periodDelta } from "@/app/(app)/dashboard/_platform/analytics/PlatformAnalytics";
import type { ConversationView } from "@/lib/platform/readModel/types";

const SRC = path.join(process.cwd(), "src");
function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}
function readCode(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function view(at: string, extra: Partial<ConversationView> = {}): ConversationView {
  return {
    id: Math.random().toString(36).slice(2),
    channel: "voice",
    employeeId: "e1",
    employeeName: "Front Desk",
    contact: { id: null, displayName: null, handle: null },
    status: null,
    intent: null,
    startedAt: at,
    lastActivityAt: at,
    summary: null,
    meta: {},
    source: "calls",
    ...extra,
  } as ConversationView;
}

/**
 * SPRINT 12 — "EVIDENCE".
 *
 * The platform analytics that replaced the legacy page was a functional regression: one fixed
 * window, four tiles, three bar lists. These tests pin the capabilities that came back and,
 * more importantly, the honesty rules that had to survive the rebuild.
 */
describe("ranges", () => {
  it("offers the three ranges the legacy page had", () => {
    expect([...ANALYTICS_RANGES]).toEqual([7, 30, 90]);
  });

  it("resolves a range from the URL, defaulting rather than failing on junk", () => {
    expect(resolveRange("30")).toBe(30);
    expect(resolveRange("90d")).toBe(90);
    expect(resolveRange("nonsense")).toBe(7);
    expect(resolveRange(null)).toBe(7);
    expect(resolveRange("365")).toBe(7);
  });
});

describe("period comparison is honest or absent", () => {
  it("splits a scan into the current window and the one before it", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    const inWindow = view("2026-08-24T10:00:00Z");
    const previousWindow = view("2026-08-16T10:00:00Z");
    const ancient = view("2026-01-01T10:00:00Z");

    const { current, previous } = splitByPeriod([inWindow, previousWindow, ancient], 7, now);
    expect(current).toHaveLength(1);
    expect(previous).toHaveLength(1);
  });

  it("ignores rows with no usable timestamp instead of bucketing them as now", () => {
    const now = new Date("2026-08-25T12:00:00Z");
    const undated = view("2026-08-24T10:00:00Z", { lastActivityAt: null, startedAt: null });
    const { current, previous } = splitByPeriod([undated], 7, now);
    expect(current).toHaveLength(0);
    expect(previous).toHaveLength(0);
  });

  it("states a delta only when there is a real baseline", () => {
    expect(periodDelta(120, 100, false)).toBe("+20% vs previous period");
    expect(periodDelta(80, 100, false)).toBe("-20% vs previous period");
    expect(periodDelta(100, 100, false)).toBe("same as previous period");
  });

  it("SUPPRESSES the delta when the scan was bounded — the baseline is truncated", () => {
    // A bounded scan loses the OLDEST rows first, which is exactly the previous period.
    // Dividing by that partial baseline would report growth that did not happen (R-018).
    expect(periodDelta(500, 120, true)).toBeNull();
  });

  it("states no delta against a zero baseline", () => {
    expect(periodDelta(50, 0, false)).toBeNull();
  });
});

describe("hourly rhythm", () => {
  it("buckets conversations by hour of day, zero-filled across 24 hours", () => {
    const hours = aggregateByHour([view("2026-08-25T09:15:00Z"), view("2026-08-24T09:45:00Z"), view("2026-08-25T17:00:00Z")]);
    expect(hours).toHaveLength(24);
    expect(hours[9]).toBe(2);
    expect(hours[17]).toBe(1);
    expect(hours[3]).toBe(0);
  });

  it("skips rows it cannot place rather than defaulting them to midnight", () => {
    const hours = aggregateByHour([view("x", { lastActivityAt: null, startedAt: null })]);
    expect(hours.reduce((a, b) => a + b, 0)).toBe(0);
  });
});

describe("estimated savings (decision D4)", () => {
  it("uses the same formula and rate as the legacy analytics", () => {
    expect(HUMAN_AGENT_HOURLY_RATE).toBe(25);
    // 120 minutes at $25/h = $50 of answering time, minus $10 actually spent.
    const { usd, minutes } = computeSavings([
      { duration_seconds: 3600, cost_usd: 4 },
      { duration_seconds: 3600, cost_usd: 6 },
    ]);
    expect(minutes).toBe(120);
    expect(usd).toBeCloseTo(40, 5);
  });

  it("never reports a negative saving", () => {
    expect(computeSavings([{ duration_seconds: 60, cost_usd: 999 }]).usd).toBe(0);
  });

  it("treats missing duration and cost as zero rather than NaN", () => {
    const { usd, minutes } = computeSavings([{ duration_seconds: null, cost_usd: null }]);
    expect(Number.isNaN(usd)).toBe(false);
    expect(minutes).toBe(0);
  });

  it("the legacy formula it mirrors is unchanged", () => {
    const legacy = read("lib/analytics/queries.ts");
    expect(legacy).toMatch(/HUMAN_AGENT_HOURLY_RATE = 25/);
    expect(legacy).toMatch(/Math\.max\(estimatedHumanCost - aiCost, 0\)/);
  });
});

describe("analytics reaches legacy parity", () => {
  const page = readCode("app/(app)/dashboard/_platform/analytics/PlatformAnalytics.tsx");

  it("offers ranges, a trend chart and the hourly rhythm", () => {
    expect(page).toMatch(/ANALYTICS_RANGES/);
    expect(page).toMatch(/TrendChart/);
    expect(page).toMatch(/HourlyChart/);
  });

  it("breaks down by channel, employee and outcome", () => {
    expect(page).toMatch(/By channel/);
    expect(page).toMatch(/By employee/);
    expect(page).toMatch(/By outcome/);
  });

  it("keeps the request query while presenting it in the platform analytics UI", () => {
    expect(page).toMatch(/RequestsAnalytics/);
    expect(page).toMatch(/getTicketsAnalytics/);
  });

  it("keeps every range on the canonical Analytics tab URL", () => {
    expect(page).toMatch(/dashboard\?tab=analytics&range=/);
  });

  it("offers CSV export to owners and admins only, through the existing route", () => {
    expect(page).toMatch(/isAdminOrOwner/);
    expect(page).toMatch(/\/api\/admin\/analytics\/export/);
  });

  it("still says so when the scan is bounded", () => {
    expect(page).toMatch(/agg\.limited/);
  });

  it("the range lives in the URL so a view is shareable", () => {
    const route = readCode("app/(app)/dashboard/analytics/page.tsx");
    expect(route).toMatch(/resolveRange/);
    expect(route).toMatch(/searchParams/);
  });
});

describe("Home shows a real time shape", () => {
  const home = readCode("app/(app)/dashboard/_platform/home/PlatformDashboard.tsx");

  it("renders the trend chart, not only bar lists", () => {
    expect(home).toMatch(/TrendChart/);
  });

  it("restores estimated savings and labels it an estimate", () => {
    expect(home).toMatch(/getEstimatedSavings/);
    expect(home).toMatch(/estimate/i);
  });

  it("shows invoice-aligned plan minute usage", () => {
    expect(home).toMatch(/getMinuteUsageSummary/);
    expect(home).toMatch(/UsageCard/);
  });

  it("keeps the action-first order — attention before trends", () => {
    expect(home.indexOf("Needs attention")).toBeLessThan(home.indexOf("Trends"));
  });

  it("still renders nothing rather than a confident zero for unknown outcomes", () => {
    expect(home).toMatch(/const show = /);
  });
});
