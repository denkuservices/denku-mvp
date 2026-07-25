import { describe, it, expect } from "vitest";
import { platformRedirectTarget } from "@/lib/platform/routeRedirects";

describe("platformRedirectTarget (legacy → platform routes)", () => {
  it("the calls LIST redirects to the unified inbox", () => {
    expect(platformRedirectTarget("/dashboard/calls")).toBe("/dashboard/conversations");
    expect(platformRedirectTarget("/dashboard/calls/")).toBe("/dashboard/conversations");
  });

  it("leads → contacts (lossless: contact id = lead id), except the create form", () => {
    expect(platformRedirectTarget("/dashboard/leads")).toBe("/dashboard/contacts");
    expect(platformRedirectTarget("/dashboard/leads/lead-9")).toBe("/dashboard/contacts/lead-9");
    // The create form has no Contacts equivalent yet → stays reachable.
    expect(platformRedirectTarget("/dashboard/leads/new")).toBeNull();
  });

  it("agents roster → employees, but NOT settings/agents (config) or the create form", () => {
    expect(platformRedirectTarget("/dashboard/agents")).toBe("/dashboard/employees");
    expect(platformRedirectTarget("/dashboard/agents/emp-1")).toBe("/dashboard/employees/emp-1");
    expect(platformRedirectTarget("/dashboard/agents/new")).toBeNull();
    expect(platformRedirectTarget("/dashboard/settings/agents")).toBeNull();
    expect(platformRedirectTarget("/dashboard/settings/agents/emp-1")).toBeNull();
  });

  it("keeps rich detail / management pages reachable (no capability loss)", () => {
    // Call detail (recording, cost) is linked from the conversation thread, not hidden.
    expect(platformRedirectTarget("/dashboard/calls/abc-123")).toBeNull();
    // Channel management pages are linked from Channels ("Manage").
    expect(platformRedirectTarget("/dashboard/phone-lines")).toBeNull();
    expect(platformRedirectTarget("/dashboard/phone-lines/line-1")).toBeNull();
    expect(platformRedirectTarget("/dashboard/instagram")).toBeNull();
  });

  it("new + unrelated routes never redirect (no loop)", () => {
    expect(platformRedirectTarget("/dashboard/conversations")).toBeNull();
    expect(platformRedirectTarget("/dashboard/conversations/x")).toBeNull();
    expect(platformRedirectTarget("/dashboard/channels")).toBeNull();
    expect(platformRedirectTarget("/dashboard/contacts")).toBeNull();
    expect(platformRedirectTarget("/dashboard")).toBeNull();
    expect(platformRedirectTarget("/dashboard/requests")).toBeNull();
  });
});

describe("Requests merge (R-122) — lists redirect, detail preserved", () => {
  it("the tickets + appointments LISTS redirect into Requests with the right tab", () => {
    expect(platformRedirectTarget("/dashboard/tickets")).toBe("/dashboard/requests?type=ticket");
    expect(platformRedirectTarget("/dashboard/appointments")).toBe("/dashboard/requests?type=appointment");
  });

  it("ticket detail + the create form stay reachable (no capability lost)", () => {
    expect(platformRedirectTarget("/dashboard/tickets/abc-123")).toBeNull();
    expect(platformRedirectTarget("/dashboard/tickets/new")).toBeNull();
  });

  it("Requests itself never redirects (no loop)", () => {
    expect(platformRedirectTarget("/dashboard/requests")).toBeNull();
  });
});
