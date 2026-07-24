import { describe, it, expect } from "vitest";
import { platformRedirectTarget } from "@/lib/platform/routeRedirects";

describe("platformRedirectTarget (legacy → platform routes)", () => {
  it("calls → conversations, preserving the detail id", () => {
    expect(platformRedirectTarget("/dashboard/calls")).toBe("/dashboard/conversations");
    expect(platformRedirectTarget("/dashboard/calls/")).toBe("/dashboard/conversations");
    expect(platformRedirectTarget("/dashboard/calls/abc-123")).toBe("/dashboard/conversations/abc-123");
  });

  it("phone-lines + instagram collapse into channels", () => {
    expect(platformRedirectTarget("/dashboard/phone-lines")).toBe("/dashboard/channels");
    expect(platformRedirectTarget("/dashboard/phone-lines/line-1")).toBe("/dashboard/channels");
    expect(platformRedirectTarget("/dashboard/instagram")).toBe("/dashboard/channels");
  });

  it("leads → contacts", () => {
    expect(platformRedirectTarget("/dashboard/leads")).toBe("/dashboard/contacts");
    expect(platformRedirectTarget("/dashboard/leads/lead-9")).toBe("/dashboard/contacts");
  });

  it("new + unrelated routes never redirect (no loop)", () => {
    expect(platformRedirectTarget("/dashboard/conversations")).toBeNull();
    expect(platformRedirectTarget("/dashboard/conversations/x")).toBeNull();
    expect(platformRedirectTarget("/dashboard/channels")).toBeNull();
    expect(platformRedirectTarget("/dashboard/contacts")).toBeNull();
    expect(platformRedirectTarget("/dashboard")).toBeNull();
    expect(platformRedirectTarget("/dashboard/tickets")).toBeNull();
    expect(platformRedirectTarget("/dashboard/settings/workspace/billing")).toBeNull();
  });
});
