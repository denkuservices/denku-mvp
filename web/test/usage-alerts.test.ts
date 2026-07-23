import { describe, it, expect, vi } from "vitest";

// usageAlerts pulls server-only + admin + sender; mock them so the pure threshold
// helper can be imported under Node.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/email/send", () => ({ sendBillingNotificationEmail: vi.fn() }));
vi.mock("@/lib/notifications/recipient", () => ({ resolveOrgOwnerEmail: vi.fn() }));

import { crossedThresholds, USAGE_THRESHOLDS } from "@/lib/billing/usageAlerts";
import { usageAlertTemplate } from "@/lib/email/templates/usageAlert";

describe("crossedThresholds (R-009)", () => {
  it("returns nothing below 50%", () => {
    expect(crossedThresholds(199, 400)).toEqual([]); // 49.75%
    expect(crossedThresholds(0, 400)).toEqual([]);
  });

  it("crosses 50/75/90 at the right usage", () => {
    expect(crossedThresholds(200, 400)).toEqual([50]); // 50%
    expect(crossedThresholds(300, 400)).toEqual([50, 75]); // 75%
    expect(crossedThresholds(360, 400)).toEqual([50, 75, 90]); // 90%
    expect(crossedThresholds(400, 400)).toEqual([50, 75, 90]); // 100%
    expect(crossedThresholds(1000, 400)).toEqual([50, 75, 90]); // over
  });

  it("guards against zero/absent included minutes", () => {
    expect(crossedThresholds(100, 0)).toEqual([]);
    expect(crossedThresholds(100, -1)).toEqual([]);
  });

  it("thresholds are exactly 50/75/90", () => {
    expect([...USAGE_THRESHOLDS]).toEqual([50, 75, 90]);
  });
});

describe("usageAlertTemplate", () => {
  it("renders the threshold, usage numbers, and billing link", () => {
    const { subject, html } = usageAlertTemplate({
      thresholdPct: 90,
      billableMinutes: 360,
      includedMinutes: 400,
      orgName: "Acme",
      billingUrl: "https://www.denku.io/dashboard/settings/workspace/billing",
    });
    expect(subject).toBe("You've used 90% of your included minutes");
    expect(html).toContain("360");
    expect(html).toContain("400");
    expect(html).toContain("Acme");
    expect(html).toContain("https://www.denku.io/dashboard/settings/workspace/billing");
  });
});
