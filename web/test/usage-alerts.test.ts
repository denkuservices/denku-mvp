import { describe, it, expect, vi } from "vitest";

// usageAlerts pulls server-only + admin + sender; mock them so the pure threshold
// helper can be imported under Node.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/email/send", () => ({ sendBillingNotificationEmail: vi.fn() }));
vi.mock("@/lib/notifications/recipient", () => ({ resolveOrgOwnerEmail: vi.fn() }));

import { crossedThresholds, shouldPauseForUsage, USAGE_THRESHOLDS } from "@/lib/billing/usageAlerts";
import { usageAlertTemplate } from "@/lib/email/templates/usageAlert";

describe("crossedThresholds (R-009)", () => {
  it("returns nothing below the default 75% warning", () => {
    expect(crossedThresholds(299, 400)).toEqual([]);
    expect(crossedThresholds(0, 400)).toEqual([]);
  });

  it("crosses the default 75/90 ladder at the right usage", () => {
    expect(crossedThresholds(200, 400)).toEqual([]);
    expect(crossedThresholds(300, 400)).toEqual([75]);
    expect(crossedThresholds(360, 400)).toEqual([75, 90]);
    expect(crossedThresholds(400, 400)).toEqual([75, 90]);
    expect(crossedThresholds(1000, 400)).toEqual([75, 90]);
  });

  it("still honors an explicit 50% workspace opt-in", () => {
    expect(crossedThresholds(200, 400, [50, 75, 90])).toEqual([50]);
  });

  it("guards against zero/absent included minutes", () => {
    expect(crossedThresholds(100, 0)).toEqual([]);
    expect(crossedThresholds(100, -1)).toEqual([]);
  });

  it("defaults to 75/90", () => {
    expect([...USAGE_THRESHOLDS]).toEqual([75, 90]);
  });
});

describe("shouldPauseForUsage — pause at 100% of included (owner policy)", () => {
  it("pauses only at/over 100% of included minutes", () => {
    expect(shouldPauseForUsage(399, 400)).toBe(false); // 99.75%
    expect(shouldPauseForUsage(400, 400)).toBe(true); // 100%
    expect(shouldPauseForUsage(500, 400)).toBe(true); // over
  });

  it("never pauses when included minutes are 0/absent (no plan)", () => {
    expect(shouldPauseForUsage(1000, 0)).toBe(false);
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

  it("renders Turkish service copy for a Turkish workspace", () => {
    const { subject, html } = usageAlertTemplate({
      thresholdPct: 90,
      billableMinutes: 360,
      includedMinutes: 400,
      billingUrl: "https://www.denku.io/dashboard/settings/workspace/billing",
      locale: "tr",
    });
    expect(subject).toContain("%90");
    expect(subject).toContain("kullandınız");
    expect(html).toContain('lang="tr"');
    expect(html).toContain("Kullanım ve faturayı görüntüle");
  });
});
