import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureContact } from "@/lib/platform/contacts";
import { ensureConversation, appendMessage } from "@/lib/platform/conversations";
import type { NormalizedInbound } from "@/lib/platform/adapters/types";

/**
 * The single generic inbound pipeline (Sprint 4.5 — Phase 2):
 *
 *   Inbound Event → Normalize (channel adapter, upstream) → Contact → Conversation →
 *   Message → [Intent] → [Automation → Artifact]
 *
 * This function owns the CHANNEL-AGNOSTIC skeleton (contact/conversation/message). The
 * channel-specific pieces are injected, so no business logic for any one channel lives
 * here:
 *   - `classifyIntent`  optional Intent stage (voice passes classifyCallIntent; IG omits
 *                        it today per the receive-only rule).
 *   - `runAutomation`   optional Automation stage (voice keeps its existing never-dead-end
 *                        ticket/appointment creation; it can now also link the artifact to
 *                        the conversation via the ctx it receives). IG omits it today.
 *
 * Never throws — a failure in the shared model must never affect the channel's own
 * primary handling (the call still completes, the IG event still 200s). Returns a result
 * the caller can log/link.
 */

export interface IntentLike {
  intent: string;
  confidence?: number;
  source?: string;
  bookingDetails?: Record<string, unknown> | null;
}

export interface AutomationContext {
  normalized: NormalizedInbound;
  orgId: string;
  conversationId: string;
  contactId: string | null;
  intent: IntentLike | null;
  db: SupabaseClient;
}

export interface IngestOptions {
  /** Intent stage. Runs only when the normalized event carries transcriptForIntent. */
  classifyIntent?: (transcript: string) => Promise<IntentLike> | IntentLike;
  /** Automation stage. Runs after the message is recorded, with full context. */
  runAutomation?: (ctx: AutomationContext) => Promise<void> | void;
  db?: SupabaseClient;
}

export interface IngestResult {
  ok: boolean;
  conversationId: string | null;
  contactId: string | null;
  messageId: string | null;
  intent: IntentLike | null;
}

const EMPTY: IngestResult = {
  ok: false,
  conversationId: null,
  contactId: null,
  messageId: null,
  intent: null,
};

/**
 * Record a normalized inbound message into the shared model and run the optional
 * intent/automation stages. Idempotent end-to-end (each step is anchored on a DB unique
 * key). Safe to call twice for the same event.
 */
export async function ingestInboundMessage(
  normalized: NormalizedInbound,
  options: IngestOptions = {}
): Promise<IngestResult> {
  const db = options.db ?? supabaseAdmin;
  const { orgId, channel } = normalized;
  if (!orgId || !channel || !normalized.externalThreadId) return EMPTY;

  try {
    // 1) Contact (idempotent identity resolution).
    const contactId = await ensureContact(
      {
        orgId,
        channel,
        externalId: normalized.contact.externalId,
        displayName: normalized.contact.displayName ?? null,
        phone: normalized.contact.phone ?? null,
        email: normalized.contact.email ?? null,
      },
      db
    );

    // 2) Conversation (idempotent per channel thread).
    const conversationId = await ensureConversation(
      {
        orgId,
        channel,
        externalThreadId: normalized.externalThreadId,
        agentId: normalized.agentId ?? null,
        contactId,
        externalUserId: normalized.contact.externalId,
        meta: normalized.meta,
      },
      db
    );
    if (!conversationId) return { ...EMPTY, contactId };

    // 3) Message (idempotent by external_message_id).
    const messageId = await appendMessage(
      {
        orgId,
        conversationId,
        role: normalized.message.role,
        content: normalized.message.content,
        direction: normalized.message.direction,
        externalMessageId: normalized.message.externalMessageId ?? null,
        createdAt: normalized.message.createdAt,
        meta: normalized.meta,
      },
      db
    );

    // 4) Intent (optional).
    let intent: IntentLike | null = null;
    if (options.classifyIntent && normalized.transcriptForIntent) {
      try {
        intent = await options.classifyIntent(normalized.transcriptForIntent);
      } catch (err) {
        console.error("[PLATFORM][INGEST][INTENT][ERROR]", err instanceof Error ? err.message : String(err));
      }
    }

    // 5) Automation → Artifact (optional).
    if (options.runAutomation) {
      try {
        await options.runAutomation({ normalized, orgId, conversationId, contactId, intent, db });
      } catch (err) {
        console.error("[PLATFORM][INGEST][AUTOMATION][ERROR]", err instanceof Error ? err.message : String(err));
      }
    }

    return { ok: true, conversationId, contactId, messageId, intent };
  } catch (err) {
    console.error("[PLATFORM][INGEST][ERROR]", err instanceof Error ? err.message : String(err));
    return EMPTY;
  }
}
