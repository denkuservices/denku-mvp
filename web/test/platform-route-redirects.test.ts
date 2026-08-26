import { describe, it, expect } from "vitest";
import { platformRedirectTarget, splitRedirectTarget } from "@/lib/platform/routeRedirects";

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
  });

  it("Analytics redirects into Home's tab, and that target is terminal", () => {
    // Analytics stopped being a surface and became a view of Home. The loop check that used to
    // live above now has to prove the destination is stable instead.
    expect(platformRedirectTarget("/dashboard/analytics")).toBe("/dashboard?tab=analytics");
    expect(platformRedirectTarget("/dashboard")).toBeNull();
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

describe("targets that carry a query survive the redirect", () => {
  /**
   * The middleware used to assign a whole target to `url.pathname`, which percent-encodes the
   * `?`: `/dashboard/tickets` redirected to `/dashboard/crm/requests%3Ftype=ticket` and 404'd.
   * The map's tests never caught it because they stop at this function and never touch the
   * middleware that consumes it — so the split now lives here, where it can be tested.
   */
  it("splits a path from its query", () => {
    expect(splitRedirectTarget("/dashboard/crm/requests?type=ticket")).toEqual({
      path: "/dashboard/crm/requests",
      query: [["type", "ticket"]],
    });
    expect(splitRedirectTarget("/dashboard?tab=analytics")).toEqual({
      path: "/dashboard",
      query: [["tab", "analytics"]],
    });
  });

  it("leaves a plain path alone", () => {
    expect(splitRedirectTarget("/dashboard/inbox")).toEqual({ path: "/dashboard/inbox", query: [] });
  });

  it("handles several params and decodes them", () => {
    expect(splitRedirectTarget("/x?a=1&b=two%20words")).toEqual({
      path: "/x",
      query: [["a", "1"], ["b", "two words"]],
    });
  });

  it("every target this map produces splits into a path that is itself terminal", () => {
    // A redirect whose destination redirects again is a loop; a destination that keeps its query
    // is the thing that broke. Both are checked against the real map rather than a fixture.
    for (const source of [
      "/dashboard/tickets",
      "/dashboard/appointments",
      "/dashboard/analytics",
      "/dashboard/calls",
    ]) {
      const target = platformRedirectTarget(source);
      expect(target, source).toBeTruthy();
      const { path } = splitRedirectTarget(target!);
      expect(path.includes("?"), `${source} → ${target}`).toBe(false);
      expect(platformRedirectTarget(path), `${target} must be terminal`).toBeNull();
    }
  });
});
