import { describe, it, expect } from "vitest";
import {
  CHANNELS,
  CHANNEL_ORDER,
  channelMeta,
  isKnownChannel,
  adoptedChannels,
  productionChannels,
  comingSoonChannels,
} from "@/lib/platform/channels";
import { evaluateConnectionHealth, daysUntil, EXPIRY_WARN_DAYS } from "@/lib/platform/connectionHealth";

const NOW = new Date("2026-07-24T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe("channel registry — identity + capability model (R-100/R-102)", () => {
  it("includes every channel in the platform vision (incl. Telegram + Web Chat)", () => {
    for (const c of ["voice", "instagram", "whatsapp", "telegram", "email", "sms", "web"]) {
      expect(isKnownChannel(c)).toBe(true);
    }
    expect(CHANNEL_ORDER).toHaveLength(Object.keys(CHANNELS).length);
  });

  it("only voice is production-ready; only voice+instagram are adopted (no over-claim)", () => {
    expect(productionChannels()).toEqual(["voice"]);
    expect(adoptedChannels()).toEqual(["voice", "instagram"]);
    expect(comingSoonChannels()).toEqual(["whatsapp", "telegram", "email", "sms", "web"]);
  });

  it("Instagram stays receive-only — outbound must not be silently enabled", () => {
    expect(CHANNELS.instagram.capabilities.outbound).toBe(false);
    expect(CHANNELS.instagram.capabilities.inbound).toBe(true);
  });

  it("voice is the only minutes-metered, non-threaded channel (billing + UX driver)", () => {
    for (const c of CHANNEL_ORDER) {
      const m = channelMeta(c);
      expect(m.capabilities.meteredByMinutes).toBe(c === "voice");
      expect(m.capabilities.threaded).toBe(c !== "voice");
    }
  });

  it("every channel declares a complete, coherent descriptor", () => {
    for (const c of CHANNEL_ORDER) {
      const m = channelMeta(c);
      expect(m.id).toBe(c);
      expect(m.label.length).toBeGreaterThan(0);
      expect(m.description.length).toBeGreaterThan(0);
      expect(m.icon.length).toBeGreaterThan(0);
      expect(["voice", "chat"]).toContain(m.kind);
      expect(["provisioned", "oauth", "credentials", "embed"]).toContain(m.connection);
      expect(m.capabilities.inbound).toBe(true); // we only build channels we can receive on
      // A channel cannot be production-ready without an adapter.
      if (m.productionReady) expect(m.adopted).toBe(true);
    }
  });
});

describe("connection health (R-101)", () => {
  it("unbuilt channels report coming_soon, never a fake healthy state", () => {
    const h = evaluateConnectionHealth({ adopted: false, status: "connected" });
    expect(h.state).toBe("coming_soon");
    expect(h.actionRequired).toBe(false);
  });

  it("a healthy connection with distant expiry is connected/ok", () => {
    const h = evaluateConnectionHealth({ status: "connected", expiresAt: inDays(60), now: NOW });
    expect(h).toMatchObject({ state: "connected", severity: "ok", actionRequired: false });
  });

  it("expiring soon → degraded/warn with days remaining (the IG silent-death case)", () => {
    const h = evaluateConnectionHealth({ status: "connected", expiresAt: inDays(3), now: NOW });
    expect(h.state).toBe("degraded");
    expect(h.severity).toBe("warn");
    expect(h.label).toContain("3 day");
    expect(h.actionRequired).toBe(true);
  });

  it("already expired → error/critical", () => {
    const h = evaluateConnectionHealth({ status: "connected", expiresAt: inDays(-1), now: NOW });
    expect(h).toMatchObject({ state: "error", severity: "critical", actionRequired: true });
  });

  it("a provider error outranks an otherwise-healthy status", () => {
    const h = evaluateConnectionHealth({ status: "connected", lastError: "Token revoked by user", now: NOW });
    expect(h.state).toBe("error");
    expect(h.detail).toContain("revoked");
  });

  it("maps the real lifecycle states", () => {
    expect(evaluateConnectionHealth({ status: "connecting" }).state).toBe("connecting");
    expect(evaluateConnectionHealth({ status: "disconnected" }).state).toBe("disconnected");
    expect(evaluateConnectionHealth({}).state).toBe("not_configured");
    expect(evaluateConnectionHealth({ status: "live" }).state).toBe("connected"); // phone_lines
    expect(evaluateConnectionHealth({ status: "weird" }).state).toBe("error"); // surfaced, not hidden
  });

  it("daysUntil handles null/invalid safely", () => {
    expect(daysUntil(null)).toBeNull();
    expect(daysUntil("not-a-date")).toBeNull();
    expect(daysUntil(inDays(EXPIRY_WARN_DAYS), NOW)).toBe(EXPIRY_WARN_DAYS);
  });
});
