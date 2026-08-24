import { describe, it, expect } from "vitest";
import { platformRedirectTarget } from "@/lib/platform/routeRedirects";

/**
 * Retargeted in the Phase 2 IA consolidation: Conversations → Inbox, Employees → AI Team,
 * Contacts/Requests → the CRM hub. The behavioural rules are unchanged — only LIST views
 * redirect, and every detail/management page stays reachable.
 */
describe("platformRedirectTarget (legacy → platform routes)", () => {
  it("the calls LIST redirects to the unified Inbox", () => {
    expect(platformRedirectTarget("/dashboard/calls")).toBe("/dashboard/inbox");
    expect(platformRedirectTarget("/dashboard/calls/")).toBe("/dashboard/inbox");
  });

  it("leads → CRM contacts (lossless: contact id = lead id), except the create form", () => {
    expect(platformRedirectTarget("/dashboard/leads")).toBe("/dashboard/crm/contacts");
    expect(platformRedirectTarget("/dashboard/leads/lead-9")).toBe("/dashboard/crm/contacts/lead-9");
    // The create form has no Contacts equivalent yet → stays reachable.
    expect(platformRedirectTarget("/dashboard/leads/new")).toBeNull();
  });

  it("agents roster → AI Team, but NOT settings/agents (config) or the create form", () => {
    expect(platformRedirectTarget("/dashboard/agents")).toBe("/dashboard/team");
    expect(platformRedirectTarget("/dashboard/agents/emp-1")).toBe("/dashboard/team/emp-1");
    expect(platformRedirectTarget("/dashboard/agents/new")).toBeNull();
    expect(platformRedirectTarget("/dashboard/settings/agents")).toBeNull();
    expect(platformRedirectTarget("/dashboard/settings/agents/emp-1")).toBeNull();
  });

  it("keeps rich detail / management pages reachable (no capability loss)", () => {
    // Call detail (recording, cost) is linked from the conversation thread, not hidden.
    expect(platformRedirectTarget("/dashboard/calls/abc-123")).toBeNull();
    // Channel management pages are linked from Settings → Channels ("Manage").
    expect(platformRedirectTarget("/dashboard/phone-lines")).toBeNull();
    expect(platformRedirectTarget("/dashboard/phone-lines/line-1")).toBeNull();
    expect(platformRedirectTarget("/dashboard/instagram")).toBeNull();
    // Channels itself is configuration, reached from Settings — never redirected away.
    expect(platformRedirectTarget("/dashboard/channels")).toBeNull();
  });

  it("current IA routes never redirect (no loop)", () => {
    expect(platformRedirectTarget("/dashboard")).toBeNull();
    expect(platformRedirectTarget("/dashboard/inbox")).toBeNull();
    expect(platformRedirectTarget("/dashboard/inbox/x")).toBeNull();
    expect(platformRedirectTarget("/dashboard/crm")).toBeNull();
    expect(platformRedirectTarget("/dashboard/crm/contacts")).toBeNull();
    expect(platformRedirectTarget("/dashboard/crm/requests")).toBeNull();
    expect(platformRedirectTarget("/dashboard/team")).toBeNull();
    expect(platformRedirectTarget("/dashboard/analytics")).toBeNull();
  });
});

describe("Requests merge (R-122) — lists redirect, detail preserved", () => {
  it("the tickets + appointments LISTS redirect into CRM Requests with the right tab", () => {
    expect(platformRedirectTarget("/dashboard/tickets")).toBe("/dashboard/crm/requests?type=ticket");
    expect(platformRedirectTarget("/dashboard/appointments")).toBe("/dashboard/crm/requests?type=appointment");
  });

  it("ticket detail + the create form stay reachable (no capability lost)", () => {
    expect(platformRedirectTarget("/dashboard/tickets/abc-123")).toBeNull();
    expect(platformRedirectTarget("/dashboard/tickets/new")).toBeNull();
  });
});

/**
 * Phase 2 renamed the first-generation platform routes. They never shipped to production
 * (PLATFORM_UX_ENABLED has always been off there), so these redirects are insurance for
 * preview/staging sessions and in-flight links rather than a compatibility debt.
 */
describe("first-generation platform routes → Phase 2 IA", () => {
  it("conversations → inbox, list and detail", () => {
    expect(platformRedirectTarget("/dashboard/conversations")).toBe("/dashboard/inbox");
    expect(platformRedirectTarget("/dashboard/conversations/conv-1")).toBe("/dashboard/inbox/conv-1");
  });

  it("employees → team, list and detail", () => {
    expect(platformRedirectTarget("/dashboard/employees")).toBe("/dashboard/team");
    expect(platformRedirectTarget("/dashboard/employees/emp-1")).toBe("/dashboard/team/emp-1");
  });

  it("contacts + requests → the CRM hub", () => {
    expect(platformRedirectTarget("/dashboard/contacts")).toBe("/dashboard/crm/contacts");
    expect(platformRedirectTarget("/dashboard/contacts/c-1")).toBe("/dashboard/crm/contacts/c-1");
    expect(platformRedirectTarget("/dashboard/requests")).toBe("/dashboard/crm/requests");
  });

  it("the new targets are terminal — a renamed route never redirects twice", () => {
    for (const source of [
      "/dashboard/conversations",
      "/dashboard/employees",
      "/dashboard/contacts",
      "/dashboard/requests",
    ]) {
      const target = platformRedirectTarget(source)!;
      expect(platformRedirectTarget(target)).toBeNull();
    }
  });
});
