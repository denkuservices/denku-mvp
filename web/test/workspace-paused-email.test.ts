import { describe, it, expect, vi } from "vitest";

// pauseNotifications imports server-only + admin + sender; mock them so the pure
// gate can be imported under Node. The template module is pure (imported directly).
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
vi.mock("@/lib/email/send", () => ({ sendBillingNotificationEmail: vi.fn() }));
vi.mock("@/lib/notifications/recipient", () => ({ resolveOrgOwnerEmail: vi.fn() }));

import { billingNotificationsEnabled } from "@/lib/billing/pauseNotifications";
import { workspacePausedTemplate } from "@/lib/email/templates/workspacePaused";

describe("billingNotificationsEnabled — staged gate (default OFF)", () => {
  it("is OFF unless the env var is exactly 'true'", () => {
    expect(billingNotificationsEnabled({})).toBe(false);
    expect(billingNotificationsEnabled({ BILLING_NOTIFICATIONS_ENABLED: "1" })).toBe(false);
    expect(billingNotificationsEnabled({ BILLING_NOTIFICATIONS_ENABLED: "true" })).toBe(true);
    expect(billingNotificationsEnabled({ BILLING_NOTIFICATIONS_ENABLED: " TRUE " })).toBe(true);
  });
});

describe("workspacePausedTemplate", () => {
  it("hard_cap → usage-cap copy + billing link", () => {
    const { subject, html } = workspacePausedTemplate({
      reason: "hard_cap",
      orgName: "Acme",
      billingUrl: "https://www.denku.io/dashboard/settings/workspace/billing",
    });
    expect(subject).toMatch(/usage cap/i);
    expect(html).toContain("Acme");
    expect(html).toMatch(/included minutes/i);
    expect(html).toMatch(/upgrade/i);
    expect(html).toContain("https://www.denku.io/dashboard/settings/workspace/billing");
  });

  it("past_due → payment copy", () => {
    const { subject, html } = workspacePausedTemplate({
      reason: "past_due",
      orgName: null,
      billingUrl: "https://www.denku.io/x",
    });
    expect(subject).toMatch(/payment needed/i);
    expect(html).toMatch(/payment/i);
  });

  it("escapes HTML in the org name", () => {
    const { html } = workspacePausedTemplate({
      reason: "hard_cap",
      orgName: "<script>alert(1)</script>",
      billingUrl: "https://www.denku.io/x",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
