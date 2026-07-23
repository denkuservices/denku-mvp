import { describe, it, expect, vi } from "vitest";

// The notification module imports the service-role client + email sender at module
// load; mock them so the pure helpers can be imported under Node (same pattern as
// org-scoping.test.ts). The template module is pure and imported directly.
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("@/lib/email/send", () => ({
  sendArtifactNotificationEmail: vi.fn(),
}));

import {
  artifactNotificationsEnabled,
  pickNotificationRecipient,
} from "@/lib/notifications/artifactNotifications";
import { artifactNotificationTemplate } from "@/lib/email/templates/artifactNotification";

describe("artifactNotificationsEnabled — staged gate (default OFF)", () => {
  it("is OFF when the env var is unset", () => {
    expect(artifactNotificationsEnabled({})).toBe(false);
  });

  it("is OFF for any value other than 'true'", () => {
    expect(artifactNotificationsEnabled({ ARTIFACT_NOTIFICATIONS_ENABLED: "1" })).toBe(false);
    expect(artifactNotificationsEnabled({ ARTIFACT_NOTIFICATIONS_ENABLED: "yes" })).toBe(false);
    expect(artifactNotificationsEnabled({ ARTIFACT_NOTIFICATIONS_ENABLED: "false" })).toBe(false);
  });

  it("is ON only for 'true' (case/space-insensitive)", () => {
    expect(artifactNotificationsEnabled({ ARTIFACT_NOTIFICATIONS_ENABLED: "true" })).toBe(true);
    expect(artifactNotificationsEnabled({ ARTIFACT_NOTIFICATIONS_ENABLED: " TRUE " })).toBe(true);
  });
});

describe("pickNotificationRecipient", () => {
  it("prefers the explicit billing email", () => {
    expect(
      pickNotificationRecipient({ billingEmail: "billing@co.com", ownerEmail: "owner@co.com" })
    ).toBe("billing@co.com");
  });

  it("falls back to the owner email when no billing email", () => {
    expect(
      pickNotificationRecipient({ billingEmail: null, ownerEmail: "owner@co.com" })
    ).toBe("owner@co.com");
  });

  it("returns null when the org has opted out, even with an address", () => {
    expect(
      pickNotificationRecipient({
        billingEmail: "billing@co.com",
        notifyOnArtifacts: false,
      })
    ).toBeNull();
  });

  it("returns null when no address is known", () => {
    expect(pickNotificationRecipient({ billingEmail: "", ownerEmail: null })).toBeNull();
  });
});

describe("artifactNotificationTemplate", () => {
  it("builds a ticket email with the subject and deep link", () => {
    const { subject, html } = artifactNotificationTemplate({
      kind: "ticket",
      title: "Support Request",
      caller: "Jane Doe",
      snippet: "Caller asked about hours",
      deepLink: "https://www.denku.io/dashboard/tickets/t-1",
      orgName: "Acme",
    });
    expect(subject).toBe("New ticket — Support Request");
    expect(html).toContain("https://www.denku.io/dashboard/tickets/t-1");
    expect(html).toContain("Acme");
    expect(html).toContain("Support Request");
  });

  it("builds an appointment email with appointment wording", () => {
    const { subject, html } = artifactNotificationTemplate({
      kind: "appointment",
      title: "Appointment request",
      deepLink: "https://www.denku.io/dashboard/appointments",
      caller: null,
      snippet: null,
    });
    expect(subject).toBe("New appointment request — Appointment request");
    expect(html).toContain("appointment request");
  });

  it("escapes HTML in caller/snippet (transcripts are caller-controlled)", () => {
    const { html } = artifactNotificationTemplate({
      kind: "ticket",
      title: "Support Request",
      caller: "<script>alert(1)</script>",
      snippet: "<img src=x onerror=alert(1)>",
      deepLink: "https://www.denku.io/dashboard/tickets/t-2",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });
});
