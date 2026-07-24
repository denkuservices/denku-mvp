import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { CHANNEL_ORDER, channelMeta, selectableChannels, comingSoonChannels } from "@/lib/platform/channels";
import { channelIcon } from "@/app/(app)/dashboard/_platform/ChannelBadge";
import {
  CONNECTION_SOURCES,
  emptyChannelView,
  comingSoonChannelViews,
  rowToChannelView,
} from "@/lib/platform/readModel/channels";
import { getRenderer } from "@/app/(app)/dashboard/_platform/conversation/renderers/registry";

/**
 * CHANNEL CONTRACT (Sprint 7 / R-099) — the guardrail behind the sprint's goal:
 *
 *   "Adding a channel = registry entry + adapter + connection table + creds route. ZERO UI edits."
 *
 * Every assertion here is written against `CHANNEL_ORDER`, so the moment someone adds a channel to
 * the registry these tests cover it automatically. If adding a channel would require touching a UI
 * file, one of these fails — which is precisely the regression this sprint exists to prevent.
 */
describe("channel contract — every registry channel renders with no per-channel UI code", () => {
  it.each(CHANNEL_ORDER)("%s: resolves an icon (unmapped keys fall back, never crash)", (channel) => {
    const Icon = channelIcon(channel);
    expect(Icon).toBeTruthy();
    expect(typeof Icon === "function" || typeof Icon === "object").toBe(true);
  });

  it.each(CHANNEL_ORDER)("%s: has a customer-facing label + description from the registry", (channel) => {
    const meta = channelMeta(channel);
    expect(meta.label.trim().length).toBeGreaterThan(0);
    expect(meta.description.trim().length).toBeGreaterThan(0);
  });

  it.each(CHANNEL_ORDER)("%s: produces a ChannelView for the Channels surface", (channel) => {
    const view = emptyChannelView(channel);
    expect(view.channel).toBe(channel);
    expect(view.label).toBe(channelMeta(channel).label);
    expect(view.meta).toHaveProperty("health");
    expect(view.meta).toHaveProperty("connection");
  });

  it.each(CHANNEL_ORDER)("%s: has a conversation turn renderer (default fallback counts)", (channel) => {
    expect(getRenderer(channel)).toBeTruthy();
  });

  it("adopted channels are exactly the selectable filters (no hardcoded filter list)", () => {
    expect(selectableChannels()).toEqual(CHANNEL_ORDER.filter((c) => channelMeta(c).adopted));
  });

  it("every non-adopted channel is surfaced truthfully as coming soon — never as available", () => {
    const soon = comingSoonChannelViews();
    expect(soon.map((v) => v.channel)).toEqual(comingSoonChannels());
    for (const v of soon) {
      expect(v.status).toBe("coming_soon");
      expect(v.productionReady).toBe(false);
      expect((v.meta.health as { state: string }).state).toBe("coming_soon");
    }
  });

  it("a channel with a connection source maps rows generically (no per-channel mapper)", () => {
    // Voice + Instagram are the two real sources; both go through ONE mapper.
    const voice = rowToChannelView("voice", CONNECTION_SOURCES.voice!, {
      id: "pl1", phone_number_e164: "+13215551234", status: "live", line_type: "support",
    });
    expect(voice).toMatchObject({ channel: "voice", identifier: "+13215551234", status: "connected" });
    expect(voice.meta.line_type).toBe("support");

    const ig = rowToChannelView("instagram", CONNECTION_SOURCES.instagram!, {
      id: "ig1", username: "denku", status: "connected", token_expires_at: null, last_error: null,
    });
    expect(ig).toMatchObject({ channel: "instagram", identifier: "denku", status: "connected" });
  });

  it("connection health flows through the view (expiry/error are not discarded — R-101)", () => {
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const expiring = rowToChannelView("instagram", CONNECTION_SOURCES.instagram!, {
      id: "ig1", username: "denku", status: "connected", token_expires_at: soon, last_error: null,
    });
    expect((expiring.meta.health as { state: string; actionRequired: boolean }).state).toBe("degraded");
    expect((expiring.meta.health as { actionRequired: boolean }).actionRequired).toBe(true);

    const broken = rowToChannelView("instagram", CONNECTION_SOURCES.instagram!, {
      id: "ig1", username: "denku", status: "connected", token_expires_at: null, last_error: "Token revoked",
    });
    expect((broken.meta.health as { state: string }).state).toBe("error");
    expect(broken.status).toBe("disconnected");
  });

  it("every connection source names a table + identifier column (backend contract)", () => {
    for (const [channel, source] of Object.entries(CONNECTION_SOURCES)) {
      expect(source!.table.length).toBeGreaterThan(0);
      expect(source!.identifierColumn.length).toBeGreaterThan(0);
      // A channel with a connection source must be adopted (it can actually receive).
      expect(channelMeta(channel as never).adopted).toBe(true);
    }
  });
});
