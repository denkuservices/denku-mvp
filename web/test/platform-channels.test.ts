import { describe, it, expect } from "vitest";
import {
  CHANNELS,
  ALL_CHANNELS,
  isKnownChannel,
  channelMeta,
  adoptedChannels,
  productionChannels,
} from "@/lib/platform/channels";

describe("platform channel registry", () => {
  it("recognizes known channels and rejects unknown", () => {
    expect(isKnownChannel("voice")).toBe(true);
    expect(isKnownChannel("instagram")).toBe(true);
    expect(isKnownChannel("whatsapp")).toBe(true);
    expect(isKnownChannel("carrier-pigeon")).toBe(false);
    expect(isKnownChannel(null)).toBe(false);
    expect(isKnownChannel(42)).toBe(false);
  });

  it("voice is the only production-ready channel today (no over-claim)", () => {
    expect(productionChannels()).toEqual(["voice"]);
    expect(CHANNELS.voice.productionReady).toBe(true);
    expect(CHANNELS.instagram.productionReady).toBe(false);
    expect(CHANNELS.whatsapp.productionReady).toBe(false);
    expect(CHANNELS.email.productionReady).toBe(false);
  });

  it("adopted channels are exactly the ones with an adapter (voice + instagram)", () => {
    expect(new Set(adoptedChannels())).toEqual(new Set(["voice", "instagram"]));
  });

  it("every channel has coherent metadata", () => {
    for (const c of ALL_CHANNELS) {
      const m = channelMeta(c);
      expect(m.id).toBe(c);
      expect(m.label.length).toBeGreaterThan(0);
      expect(["voice", "chat"]).toContain(m.kind);
    }
    expect(channelMeta("voice").kind).toBe("voice");
    expect(channelMeta("instagram").kind).toBe("chat");
  });
});
