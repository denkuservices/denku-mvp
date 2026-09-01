import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ensureContact } from "@/lib/platform/contacts";
import { ensureConversation, appendMessage } from "@/lib/platform/conversations";
import type { NormalizedInbound } from "@/lib/platform/adapters/types";
import { composeMessageContent, processInboundMedia } from "@/lib/platform/media/understand";
import type { AttachmentRecord, MediaResolver } from "@/lib/platform/media/types";

/**
 * The single generic inbound pipeline (Sprint 4.5 — Phase 2; Perception added Sprint 8):
 *
 *   Inbound Event → Normalize (channel adapter, upstream) → Contact → Conversation →
 *   [Perception] → Message → [Intent] → [Automation → Artifact]
 *
 * This function owns the CHANNEL-AGNOSTIC skeleton (contact/conversation/message). The
 * channel-specific pieces are injected, so no business logic for any one channel lives
 * here:
 *   - `resolveMedia`    optional Perception stage. Fetching an attachment needs the channel's
 *                        own credential (a bot token, an API key), so the channel supplies the
 *                        fetcher and this file supplies the rest: caps, storage, vision,
 *                        transcription, and folding what was found into the message body.
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
  /**
   * Perception stage. Supplied by channels whose customers can send photos and voice notes;
   * omitted by channels that cannot (or that have not been wired yet), in which case attachments
   * are ignored exactly as they were before this stage existed.
   */
  resolveMedia?: MediaResolver;
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
  /**
   * The message body as STORED — which is not always the body the adapter produced.
   *
   * When the customer attached a photo or a voice note, this is the text plus what the AI saw or
   * heard. Callers must answer THIS rather than the raw normalized content, or the reply engine
   * would be reasoning about an empty message while the description sits in the database.
   */
  content: string | null;
  /** One record per attachment, exactly as written to `messages.meta.media`. */
  media: AttachmentRecord[];
}

const EMPTY: IngestResult = {
  ok: false,
  conversationId: null,
  contactId: null,
  messageId: null,
  intent: null,
  content: null,
  media: [],
};

/**
 * Have we stored this exact channel message already?
 *
 * Only asked on the media path, and only when the channel gave us an id to ask with. Returns what
 * was stored the first time so a replayed delivery costs one cheap read instead of a fresh vision
 * call and a duplicate file in storage.
 */
async function findStoredMessage(
  db: SupabaseClient,
  conversationId: string,
  externalMessageId: string | null | undefined
): Promise<{ id: string; content: string; media: AttachmentRecord[] } | null> {
  if (!externalMessageId) return null;
  try {
    const { data } = await db
      .from("messages")
      .select("id, content, meta")
      .eq("conversation_id", conversationId)
      .eq("external_message_id", externalMessageId)
      .maybeSingle<{ id: string; content: string; meta: Record<string, unknown> | null }>();

    if (!data?.id) return null;
    const stored = data.meta?.media;
    return {
      id: data.id,
      content: data.content ?? "",
      media: Array.isArray(stored) ? (stored as AttachmentRecord[]) : [],
    };
  } catch {
    // A failed lookup means we process it again — wasteful, never wrong.
    return null;
  }
}

/**
 * Record a normalized inbound message into the shared model and run the optional
 * perception/intent/automation stages. Idempotent end-to-end (each step is anchored on a DB
 * unique key). Safe to call twice for the same event.
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

    /**
     * 3) Perception — read the photo, hear the voice note.
     *
     * Runs BEFORE the message is written, because what the AI saw belongs in the message body
     * rather than bolted on afterwards: one row, one truth, and every reader downstream gets it
     * for free.
     *
     * The redelivery check in front of it is not an optimisation, it is the idempotency rule
     * applied where it costs real money. `appendMessage` already makes a replayed webhook a no-op,
     * but by then we would have paid for the vision call and stored a second copy of the same
     * photo. So a message we have already recorded short-circuits here, and the caller gets the
     * content we stored the first time.
     */
    const attachments = normalized.message.attachments ?? [];
    let content = normalized.message.content ?? "";
    let media: AttachmentRecord[] = [];
    let meta = normalized.meta;

    if (attachments.length > 0 && options.resolveMedia) {
      const stored = await findStoredMessage(db, conversationId, normalized.message.externalMessageId);
      if (stored) {
        console.info("[PLATFORM][INGEST][MEDIA][REDELIVERY]", { org_id: orgId, conversation_id: conversationId });
        return {
          ok: true,
          conversationId,
          contactId,
          messageId: stored.id,
          intent: null,
          content: stored.content,
          media: stored.media,
        };
      }

      const perceived = await processInboundMedia({
        orgId,
        conversationId,
        attachments,
        caption: content,
        resolve: options.resolveMedia,
        db,
      });
      media = perceived.records;
      content = composeMessageContent(content, perceived.rendition);
      meta = { ...(meta ?? {}), media: perceived.records };
    }

    /**
     * A message that is nothing but an attachment must still be a message.
     *
     * `appendMessage` refuses empty content, so a photo arriving on a channel whose webhook has
     * not (or cannot) supply a resolver would otherwise disappear entirely — the customer would
     * see it sent and the owner would see nothing. Never dead-end applies here too.
     */
    if (!content.trim() && attachments.length > 0) {
      content = attachments.map((a) => `[${a.kind}] received.`).join("\n");
    }

    // 4) Message (idempotent by external_message_id).
    const messageId = await appendMessage(
      {
        orgId,
        conversationId,
        role: normalized.message.role,
        content,
        direction: normalized.message.direction,
        externalMessageId: normalized.message.externalMessageId ?? null,
        createdAt: normalized.message.createdAt,
        meta,
      },
      db
    );

    // 5) Intent (optional). Reads the ENRICHED body: "the receipt says 340 TL" is an intent
    // signal, and it only exists once perception has run.
    const intentSignal =
      normalized.transcriptForIntent == null
        ? null
        : attachments.length > 0
          ? content
          : normalized.transcriptForIntent;

    let intent: IntentLike | null = null;
    if (options.classifyIntent && intentSignal) {
      try {
        intent = await options.classifyIntent(intentSignal);
      } catch (err) {
        console.error("[PLATFORM][INGEST][INTENT][ERROR]", err instanceof Error ? err.message : String(err));
      }
    }

    // 6) Automation → Artifact (optional).
    if (options.runAutomation) {
      try {
        await options.runAutomation({ normalized, orgId, conversationId, contactId, intent, db });
      } catch (err) {
        console.error("[PLATFORM][INGEST][AUTOMATION][ERROR]", err instanceof Error ? err.message : String(err));
      }
    }

    return { ok: true, conversationId, contactId, messageId, intent, content, media };
  } catch (err) {
    console.error("[PLATFORM][INGEST][ERROR]", err instanceof Error ? err.message : String(err));
    return EMPTY;
  }
}
