import type { ComponentType } from "react";
import type { ConversationTurn } from "@/lib/platform/readModel/types";

/**
 * Plugin conversation-renderer contract (Sprint 5, P2 — owner requirement #2).
 *
 * The conversation thread UI is plugin-based FROM DAY ONE: each channel provides a
 * component that renders one turn; the core <ConversationThread> dispatches by
 * `turn.channel` via the registry. A future channel (WhatsApp/Email/SMS/WebChat) adds a
 * renderer by calling `registerRenderer(channel, Component)` — with NO change to the core
 * thread component. `TurnRenderer` is deliberately turn-scoped so channels can style
 * bubbles/metadata differently (e.g. Email could show subject + quoted history) while the
 * thread layout stays shared.
 */
export interface TurnRendererProps {
  turn: ConversationTurn;
}

export type TurnRenderer = ComponentType<TurnRendererProps>;
