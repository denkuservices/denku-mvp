import type { Channel } from "@/lib/platform/channels";
import type { TurnRenderer } from "./types";
import DefaultTurnRenderer from "./DefaultTurnRenderer";

/**
 * Conversation turn-renderer registry (Sprint 5, P2 — owner requirement #2).
 *
 * A channel → renderer map, seeded with the built-in renderers. Adding a channel renderer
 * is a one-liner (`registerRenderer('whatsapp', WhatsAppTurn)`) from that channel's own
 * module — the core <ConversationThread> never changes. Unknown channels fall back to the
 * DefaultTurnRenderer, so a new channel renders reasonably even before it ships a renderer.
 */
const REGISTRY = new Map<Channel, TurnRenderer>();

export function registerRenderer(channel: Channel, renderer: TurnRenderer): void {
  REGISTRY.set(channel, renderer);
}

export function getRenderer(channel: Channel): TurnRenderer {
  return REGISTRY.get(channel) ?? DefaultTurnRenderer;
}

export function hasRenderer(channel: Channel): boolean {
  return REGISTRY.has(channel);
}

// Built-in renderers. Voice + Instagram use the default bubble today; each is registered
// explicitly so a channel-specific renderer can replace it without touching the core.
registerRenderer("voice", DefaultTurnRenderer);
registerRenderer("instagram", DefaultTurnRenderer);
