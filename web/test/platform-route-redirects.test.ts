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
    expect(platformRedirectTarget("/dashboard/tickets")).toBeNull();
  });
});
