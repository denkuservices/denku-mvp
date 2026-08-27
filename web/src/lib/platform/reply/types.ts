import type { Channel } from "@/lib/platform/channels";

/**
 * The reply engine's vocabulary — deliberately channel-free.
 *
 * Voice has always had a reply engine: it is Vapi's, running inside the call. This one is for
 * the chat channels, where nobody has been answering at all. Nothing in these types names
 * Telegram, because the second chat channel must cost an adapter and a transport, not a rewrite.
 */

/** The AI Employee doing the talking, resolved once per reply. */
export interface ReplyEmployee {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  language: string | null;
  timezone: string | null;
  /** The derived voice-side prompt, when the customer wrote one. */
  systemPromptOverride: string | null;
  businessContext: Record<string, unknown> | null;
}

/** One turn of history handed to the model. */
export interface ReplyTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ReplyRequest {
  orgId: string;
  conversationId: string;
  contactId: string | null;
  channel: Channel;
  employee: ReplyEmployee;
  /** Oldest → newest, already trimmed to what we are willing to pay for. */
  history: ReplyTurn[];
  /** What the customer just said (also the last entry of `history`). */
  incoming: string;
  /** Their name, when the channel knows it — so the AI never asks for what we already have. */
  contactName: string | null;
}

export type ReplyArtifact = { type: "ticket" | "appointment"; id: string };

export interface ReplyResult {
  ok: boolean;
  /** What to send back. Null means: say nothing (rate-limited, or no model configured). */
  text: string | null;
  artifacts: ReplyArtifact[];
  /** Why there is no text, for logs — never shown to a customer. */
  reason?: string;
}

/**
 * How a reply physically leaves the building.
 *
 * One implementation per channel, resolved from a registry. `threadId` is the channel-native
 * destination (a Telegram chat id, later a WhatsApp number); `connectionId` says which of the
 * org's connections to send through, because an org may own several.
 */
export interface TransportTarget {
  orgId: string;
  conversationId: string;
  threadId: string;
  connectionId: string | null;
}

export interface TransportResult {
  ok: boolean;
  externalMessageId?: string | null;
  error?: string;
}

export interface ReplyTransport {
  channel: Channel;
  sendText(target: TransportTarget, text: string): Promise<TransportResult>;
  /** Optional "typing…" hint. Best-effort; failure is never reported. */
  indicateTyping?(target: TransportTarget): Promise<void>;
}
