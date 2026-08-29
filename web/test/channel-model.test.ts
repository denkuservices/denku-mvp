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
import { channelToneClass, channelIconClass } from "@/app/(app)/dashboard/_platform/ChannelBadge";

const NOW = new Date("2026-07-24T12:00:00Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

describe("channel registry — identity + capability model (R-100/R-102)", () => {
  it("includes every channel in the platform vision (incl. Telegram + Web Chat)", () => {
    for (const c of ["voice", "instagram", "messenger", "whatsapp", "telegram", "email", "sms", "web"]) {
      expect(isKnownChannel(c)).toBe(true);
    }
    expect(CHANNEL_ORDER).toHaveLength(Object.keys(CHANNELS).length);
  });

  it("voice+telegram are production-ready; voice+instagram+telegram+email are adopted (no over-claim)", () => {
    // Both earned production the same way: a real conversation on production, verified in the
    // database afterwards. Instagram is adopted but cannot reply, so it stays out of the
    // sellable list. Email is adopted — it receives and normalizes — but has not yet made the
    // round trip on a real mailbox, so it stays out too. `adopted` and `productionReady` are
    // different claims and this is the test that stops them collapsing into one.
    expect(productionChannels()).toEqual(["voice", "telegram"]);
    expect(adoptedChannels()).toEqual(["voice", "instagram", "telegram", "email"]);
    expect(comingSoonChannels()).toEqual(["messenger", "whatsapp", "sms", "web"]);
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

  it("a live connection nobody owns is NOT healthy — it is unanswered", () => {
    // The state this workspace was actually in: a phone line live in Vapi, assigned to no
    // employee. Channels said "Connected", the employee page said "No channels connected", and
    // Home said no employee was reachable — all true, all describing different things, and the
    // one a customer would act on (callers hear nothing) stated by none of them.
    const h = evaluateConnectionHealth({ status: "live", assignable: true, assignedTo: null, now: NOW });
    expect(h.state).toBe("degraded");
    expect(h.severity).toBe("warn");
    expect(h.actionRequired).toBe(true);
    expect(h.code).toBe("unassigned");
  });

  it("the same connection with an owner is healthy", () => {
    const h = evaluateConnectionHealth({ status: "live", assignable: true, assignedTo: "agent-1", now: NOW });
    expect(h).toMatchObject({ state: "connected", severity: "ok", actionRequired: false });
    expect(h.code).toBeUndefined();
  });

  it("a channel that cannot be assigned is unaffected", () => {
    // Instagram is org-level today — it has no owner column, so absence of an owner says nothing.
    const h = evaluateConnectionHealth({ status: "connected", assignable: false, assignedTo: null, now: NOW });
    expect(h.state).toBe("connected");
  });

  it("expiry and provider errors still outrank an unassigned connection", () => {
    // Ordering matters: a revoked credential is a bigger problem than an unassigned one, and
    // fixing the assignment would not fix the channel.
    expect(
      evaluateConnectionHealth({ status: "live", assignable: true, assignedTo: null, expiresAt: inDays(-1), now: NOW }).state
    ).toBe("error");
    expect(
      evaluateConnectionHealth({ status: "live", assignable: true, assignedTo: null, lastError: "Revoked", now: NOW }).state
    ).toBe("error");
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

describe("channel colour is identification, not decoration", () => {
  /**
   * Every badge used to be the same grey, which made the channel column of the Inbox unreadable
   * at a glance - the one place a customer needs to tell a phone call from an Instagram DM
   * without reading. Tone now comes from the registry.
   *
   * The invariant that matters is the restraint: a channel that does not work yet stays neutral.
   * Brand colour on a coming-soon card would make the unavailable thing the most eye-catching
   * item on the page, which is the opposite of what the honesty rule asks for.
   */
  it("every channel declares a tone", () => {
    for (const c of CHANNEL_ORDER) {
      expect(channelMeta(c).tone, `${c} needs a tone`).toBeTruthy();
    }
  });

  it("working channels are coloured; unbuilt ones stay neutral", () => {
    for (const c of CHANNEL_ORDER) {
      const cls = channelToneClass(c);
      const neutral = /border-gray-200/.test(cls);
      expect(neutral, `${c} (adopted=${channelMeta(c).adopted})`).toBe(!channelMeta(c).adopted);
    }
  });

  /**
   * Inbox v2 split colour into two jobs. The GLYPH is identity — Instagram is magenta because
   * Instagram is magenta, which says nothing about whether this org has connected it. The CHROME
   * (asserted above) still carries availability. Collapsing the two back together would either
   * grey out logos nobody can then recognise, or paint an unbuilt channel as if it worked.
   */
  it("every channel's glyph carries a brand colour, built or not", () => {
    for (const c of CHANNEL_ORDER) {
      expect(channelIconClass(c), `${c} needs a glyph colour`).toMatch(/text-/);
    }
    // The unbuilt ones are coloured too, and not all the same colour.
    expect(channelIconClass("messenger")).not.toBe(channelIconClass("instagram"));
    expect(channelIconClass("whatsapp")).not.toBe(channelIconClass("telegram"));
  });

  it("no two channels share a glyph colour", () => {
    const colours = CHANNEL_ORDER.map((c) => channelIconClass(c));
    expect(new Set(colours).size).toBe(CHANNEL_ORDER.length);
  });

  it("tones are distinct per channel, so two channels never look alike", () => {
    const adopted = CHANNEL_ORDER.filter((c) => channelMeta(c).adopted);
    const classes = adopted.map((c) => channelToneClass(c));
    expect(new Set(classes).size).toBe(adopted.length);
  });
});
