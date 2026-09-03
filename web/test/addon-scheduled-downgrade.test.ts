import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  effectiveAddonQty,
  pendingDowngrade,
  planAddonChange,
  phoneDowngradeBlocked,
  isSchedulableAddon,
} from "@/lib/billing/addonSchedule";
import { addonPurchasedTemplate } from "@/lib/email/templates/addonPurchased";

const SRC = path.join(process.cwd(), "src");
function readCode(rel: string): string {
  return fs
    .readFileSync(path.join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const NOW = new Date("2026-09-03T12:00:00.000Z");
const NEXT_WEEK = new Date("2026-09-14T00:00:00.000Z");
const LAST_WEEK = new Date("2026-08-27T00:00:00.000Z");

/**
 * DROPPING AN ADD-ON IS NEVER A REFUND (2026-09-03).
 *
 * The customer paid for a month. Dropping an extra number or an extra concurrent call therefore
 * takes nothing away today — the capacity stays until the period ends and then does not renew, and
 * what they get instead of money back is a date, said before they confirm.
 *
 * Both halves used to be the opposite: Stripe's DEFAULT proration credited the unused days back
 * because `proration_behavior` was simply never passed, and the row flipped to `inactive` in the
 * same request, so the capacity vanished on day two of a month paid in full.
 */
describe("effectiveAddonQty — entitlement is decided by the date, not by the sweep", () => {
  it("gives the full quantity while the paid period is still running", () => {
    expect(
      effectiveAddonQty(
        { qty: 2, status: "active", ends_at: NEXT_WEEK.toISOString(), scheduled_qty: 0 },
        NOW
      )
    ).toBe(2);
  });

  it("drops to the scheduled quantity the moment the period ends, sweep or no sweep", () => {
    // The only cron in this product runs monthly and Stripe periods are not calendar-aligned, so
    // a workspace must not keep capacity for weeks because a job has not fired.
    expect(
      effectiveAddonQty(
        { qty: 2, status: "active", ends_at: LAST_WEEK.toISOString(), scheduled_qty: 1 },
        NOW
      )
    ).toBe(1);
  });

  it("treats a passed date with no scheduled quantity as fully dropped", () => {
    expect(
      effectiveAddonQty(
        { qty: 1, status: "active", ends_at: LAST_WEEK.toISOString(), scheduled_qty: null },
        NOW
      )
    ).toBe(0);
  });

  it("is unchanged for every row that has no schedule on it", () => {
    expect(effectiveAddonQty({ qty: 3, status: "active" }, NOW)).toBe(3);
    expect(effectiveAddonQty({ qty: 3, status: "inactive" }, NOW)).toBe(0);
    expect(effectiveAddonQty(null, NOW)).toBe(0);
  });

  it("never returns a negative quantity", () => {
    expect(effectiveAddonQty({ qty: -5, status: "active" }, NOW)).toBe(0);
  });
});

describe("pendingDowngrade — what the billing page tells the customer", () => {
  it("reports a future end date so the card can say 'yours until …'", () => {
    expect(
      pendingDowngrade(
        { qty: 1, status: "active", ends_at: NEXT_WEEK.toISOString(), scheduled_qty: 0 },
        NOW
      )
    ).toEqual({ endsAt: NEXT_WEEK.toISOString(), qtyAfter: 0 });
  });

  it("reports nothing once the date has passed — there is no promise left to make", () => {
    expect(
      pendingDowngrade(
        { qty: 1, status: "active", ends_at: LAST_WEEK.toISOString(), scheduled_qty: 0 },
        NOW
      )
    ).toBeNull();
  });

  it("reports nothing for an ordinary row", () => {
    expect(pendingDowngrade({ qty: 1, status: "active" }, NOW)).toBeNull();
  });
});

describe("planAddonChange", () => {
  it("schedules a decrease to the end of the paid period", () => {
    expect(
      planAddonChange({
        addonKey: "extra_phone",
        currentQty: 1,
        requestedQty: 0,
        periodEnd: NEXT_WEEK,
        now: NOW,
      })
    ).toEqual({
      kind: "scheduled_decrease",
      keepQty: 1,
      scheduledQty: 0,
      endsAt: NEXT_WEEK.toISOString(),
    });
  });

  it("keeps increases immediate and clears any pending downgrade", () => {
    const plan = planAddonChange({
      addonKey: "extra_concurrency",
      currentQty: 1,
      requestedQty: 3,
      periodEnd: NEXT_WEEK,
      now: NOW,
    });
    expect(plan).toEqual({ kind: "increase", qty: 3, clearsSchedule: true });
  });

  it("does not schedule chat tiers — they are mutually exclusive and would block switching", () => {
    // Holding a dropped `chat_standard` as active until the period ends would make the purchase
    // route refuse `chat_basic` for up to a month.
    expect(isSchedulableAddon("chat_standard")).toBe(false);
    expect(
      planAddonChange({
        addonKey: "chat_standard",
        currentQty: 1,
        requestedQty: 0,
        periodEnd: NEXT_WEEK,
        now: NOW,
      })
    ).toEqual({ kind: "immediate_decrease", qty: 0, reason: "not_schedulable" });
  });

  it("falls back to the old behaviour when Stripe gave us no period end", () => {
    // Never invent a date at a customer: with nothing to promise, the honest option is the
    // behaviour that was already there.
    expect(
      planAddonChange({
        addonKey: "extra_phone",
        currentQty: 1,
        requestedQty: 0,
        periodEnd: null,
        now: NOW,
      })
    ).toEqual({ kind: "immediate_decrease", qty: 0, reason: "no_period_end" });
  });

  it("does nothing when the quantity did not move", () => {
    expect(
      planAddonChange({
        addonKey: "extra_phone",
        currentQty: 2,
        requestedQty: 2,
        periodEnd: NEXT_WEEK,
        now: NOW,
      })
    ).toEqual({ kind: "noop", qty: 2 });
  });
});

describe("phoneDowngradeBlocked — a published number never loses its slot", () => {
  it("refuses to sell back a slot that a live line is standing on", () => {
    // 1 included + 1 extra = 2 lines in use; dropping the extra would leave 2 lines and 1 slot.
    expect(
      phoneDowngradeBlocked({ basePhones: 1, requestedExtraPhones: 0, linesInUse: 2 })
    ).toMatchObject({ blocked: true, linesAfter: 2, slotsAfter: 1 });
  });

  it("allows it once the customer has deleted the line themselves", () => {
    expect(
      phoneDowngradeBlocked({ basePhones: 1, requestedExtraPhones: 0, linesInUse: 1 })
    ).toMatchObject({ blocked: false });
  });

  it("allows the phone-line delete path, which asks while its own line is still in the table", () => {
    expect(
      phoneDowngradeBlocked({
        basePhones: 1,
        requestedExtraPhones: 0,
        linesInUse: 2,
        releasingLines: 1,
      })
    ).toMatchObject({ blocked: false, linesAfter: 1, slotsAfter: 1 });
  });
});

describe("the wiring that makes the policy real", () => {
  const ROUTE = readCode("app/api/billing/addons/update/route.ts");

  it("tells Stripe not to prorate a scheduled decrease", () => {
    // The absence of this parameter WAS the refund.
    expect(ROUTE).toMatch(/proration_behavior:\s*"none"/);
  });

  it("keeps the held quantity on the row and records the schedule beside it", () => {
    expect(ROUTE).toMatch(/qty:\s*changePlan\.kind === "scheduled_decrease" \? changePlan\.keepQty : qty/);
    expect(ROUTE).toMatch(/ends_at:\s*changePlan\.kind === "scheduled_decrease"/);
    expect(ROUTE).toMatch(/scheduled_qty:\s*changePlan\.kind === "scheduled_decrease"/);
  });

  it("reads the period end from Stripe rather than computing a month", () => {
    expect(ROUTE).toMatch(/subscription\.current_period_end/);
  });

  it("limits entitlement through the shared helper, so status alone can never grant capacity", () => {
    const LIMITS = readCode("lib/billing/limits.ts");
    expect(LIMITS).toMatch(/effectiveAddonQty\(/);
    // The old `.eq("status", "active")` filter would hide a row whose date has passed AND would
    // return the pre-downgrade quantity for one whose date has not.
    expect(LIMITS).not.toMatch(/\.eq\("status",\s*"active"\)/);
  });

  it("gives the paid slot back when a line is deleted (the count bug that never fired)", () => {
    const DELETE_ROUTE = readCode("app/api/phone-lines/[lineId]/route.ts");
    expect(DELETE_ROUTE).toMatch(/const \{ count: lineCount \}/);
    expect(DELETE_ROUTE).not.toMatch(/allLines\?\.length/);
    expect(DELETE_ROUTE).toMatch(/releasing_lines:\s*1/);
  });
});

describe("the email says the date, in the customer's language", () => {
  it("leads with when it ends rather than with what was removed", () => {
    const { subject, html } = addonPurchasedTemplate({
      addonKey: "extra_phone",
      qty: 0,
      previousQty: 1,
      endsAt: "2026-09-14T00:00:00.000Z",
      billingUrl: "https://denku.io/billing",
    });
    expect(subject).toMatch(/end of this billing period/i);
    expect(html).toContain("September 14, 2026");
    expect(html).toMatch(/no refund/i);
  });

  it("says it in Turkish too, with a Turkish date", () => {
    const { html } = addonPurchasedTemplate({
      addonKey: "extra_concurrency",
      qty: 0,
      previousQty: 1,
      endsAt: "2026-09-14T00:00:00.000Z",
      locale: "tr",
      billingUrl: "https://denku.io/billing",
    });
    expect(html).toContain("14 Eylül 2026");
    expect(html).toMatch(/iade yapılmaz/i);
  });

  it("still renders the old immediate-removal mail when nothing is scheduled", () => {
    const { subject, html } = addonPurchasedTemplate({
      addonKey: "extra_phone",
      qty: 0,
      previousQty: 1,
      billingUrl: "https://denku.io/billing",
    });
    expect(subject).toMatch(/updated/i);
    expect(html).not.toMatch(/September/);
  });
});
