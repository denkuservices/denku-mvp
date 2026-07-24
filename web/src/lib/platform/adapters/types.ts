import type { Channel } from "@/lib/platform/channels";
import type { MessageRole, MessageDirection } from "@/lib/platform/conversations";

/**
 * Channel adapter contract (Sprint 4.5 — Phase 3: shared architecture).
 *
 * Every channel — voice, Instagram, and future WhatsApp/Email/SMS/WebChat — plugs into
 * the platform by implementing ONE thing: normalize its native inbound event into one or
 * more `NormalizedInbound` records. The shared ingest pipeline (lib/platform/ingest.ts)
 * then does the rest (contact → conversation → message → optional intent/automation),
 * with NO channel-specific business logic. Adding a channel = a connection table + an
 * adapter here + registration, and the whole platform (inbox, contacts, artifacts) picks
 * it up. This is the O(1)-per-channel property the audit calls for.
 */

/** The channel-agnostic shape every inbound event is normalized to. */
export interface NormalizedInbound {
  channel: Channel;
  orgId: string;
  /** The AI Employee handling this (agents.id), if resolvable. */
  agentId?: string | null;
  /** Channel-native thread key → one Conversation (vapi_call_id, IG sender/thread id). */
  externalThreadId: string;
  /** Who the conversation is with, by channel-native identity. */
  contact: {
    externalId: string;
    displayName?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  /** The message to append. */
  message: {
    role: MessageRole;
    direction: MessageDirection;
    content: string;
    /** Channel-native id → idempotent append. Omit for synthetic/derived messages. */
    externalMessageId?: string | null;
    createdAt?: string;
  };
  /**
   * Text handed to the intent classifier when the pipeline runs an Intent stage
   * (voice: the full transcript; chat: usually the message text). Optional — when absent
   * the pipeline skips intent.
   */
  transcriptForIntent?: string | null;
  /** Channel-specific extras stored on the message/conversation meta. */
  meta?: Record<string, unknown>;
}

export interface NormalizeContext {
  orgId: string;
  agentId?: string | null;
}

export interface ChannelAdapter {
  channel: Channel;
  /**
   * Map a channel-native inbound payload to zero or more normalized messages. A single
   * webhook delivery can carry several messages (IG batches), hence the array. Must be
   * pure/deterministic and never throw — return [] on anything unrecognized.
   */
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[];
}
