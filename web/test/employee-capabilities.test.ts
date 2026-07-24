import { describe, it, expect } from "vitest";
import {
  employeeChannelCapability,
  employeeCan,
  employeeCapabilities,
} from "@/lib/platform/employeeCapabilities";
import { CHANNEL_ORDER, channelMeta } from "@/lib/platform/channels";

describe("employee ↔ channel capabilities (R-104)", () => {
  it("voice: an employee can answer, reply, book and escalate", () => {
    const cap = employeeChannelCapability("voice");
    expect(cap.actions).toEqual(["receive", "reply", "create_artifacts", "escalate"]);
    expect(cap.limitations).toEqual([]);
  });

  it("instagram is receive-only — reply is absent and the limitation is stated, not hidden", () => {
    const cap = employeeChannelCapability("instagram");
    expect(cap.actions).toContain("receive");
    expect(cap.actions).not.toContain("reply");
    expect(cap.limitations.join(" ")).toMatch(/cannot reply/i);
  });

  it("unbuilt channels grant no actions and say so truthfully", () => {
    for (const c of CHANNEL_ORDER.filter((x) => !channelMeta(x).adopted)) {
      const cap = employeeChannelCapability(c);
      expect(cap.actions).toEqual([]);
      expect(cap.limitations[0]).toMatch(/isn't available yet/i);
    }
  });

  it("artifact creation is channel-agnostic (the never-dead-end guarantee)", () => {
    for (const c of CHANNEL_ORDER.filter((x) => channelMeta(x).adopted)) {
      expect(employeeCan(c, "create_artifacts")).toBe(true);
      expect(employeeCan(c, "escalate")).toBe(true);
    }
  });

  it("per-employee overrides can disable replies/artifacts without touching the channel", () => {
    expect(employeeCan("voice", "reply")).toBe(true);
    expect(employeeCan("voice", "reply", { replyDisabled: true })).toBe(false);
    expect(employeeChannelCapability("voice", { replyDisabled: true }).limitations.join(" ")).toMatch(/turned off/i);
    expect(employeeCan("voice", "create_artifacts", { artifactsDisabled: true })).toBe(false);
  });

  it("reply capability always tracks the channel's outbound capability", () => {
    for (const c of CHANNEL_ORDER.filter((x) => channelMeta(x).adopted)) {
      expect(employeeCan(c, "reply")).toBe(channelMeta(c).capabilities.outbound);
    }
  });

  it("employeeCapabilities maps a whole roster of channels", () => {
    const caps = employeeCapabilities(["voice", "instagram"]);
    expect(caps.map((c) => c.channel)).toEqual(["voice", "instagram"]);
  });
});
