import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getConnectionByInboundAddress,
  markInbound,
  selfAddressesFor,
} from "@/lib/email/channel/connections";
import { emailAdapter, type InboundEmail } from "@/lib/platform/adapters/email";
import { parseGmailConfirmation, completeGmailForwarding } from "@/lib/email/channel/gmailForwarding";
import { recordForwardConfirmation } from "@/lib/email/channel/verification";
import { ingestInboundMessage } from "@/lib/platform/ingest";
import { respondToInbound } from "@/lib/platform/reply/respond";

export const dynamic = "force-dynamic";

/**
 * Email webhook — receive a forwarded customer email, record it, and (later) answer it.
 *
 * **Authentication.** Resend signs every delivery with Svix headers (`svix-id`,
 * `svix-timestamp`, `svix-signature`) over the RAW body. So the body is read as text and
 * verified BEFORE it is parsed — the same rule the Instagram webhook follows, and for the same
 * reason: verifying a re-serialized object verifies nothing. Like Instagram and unlike the Vapi
 * webhook (landmine #1) there is no observe-only mode; this channel has never had traffic, so
 * it enforces from its first request.
 *
 * **Why it always answers 200 after auth passes.** Resend retries a non-2xx delivery, and a
 * retry of a mail we already recorded and answered would mean a second reply to the customer.
 * Once authenticated, every downstream failure is logged and swallowed. A bad signature answers
 * 401 and writes nothing.
 *
 * **Why the recipient is the routing key.** A delivery tells us who it was addressed to and
 * nothing about which workspace that is — so `email_connections.inbound_address` is globally
 * unique and resolves the org. An unrecognised recipient is logged and answered 200: retrying
 * would not make the address exist.
 *
 * **Not gated by `PLATFORM_MODEL_ENABLED`.** That flag protects voice's byte-for-byte legacy
 * behaviour during dual-write. Email has no legacy store — `conversations`/`messages` is its
 * only home — so gating it would mean a channel that receives nothing. Same carve-out as
 * Telegram.
 */

function resendClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  return key ? new Resend(key) : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const resend = resendClient();

  if (!secret || !resend) {
    // Refusing is the honest answer: without the secret we cannot tell Resend from anyone else,
    // and processing unverified mail would let a stranger put words in a customer's Inbox.
    console.error("[EMAIL][WEBHOOK][NOT_CONFIGURED]", { hasSecret: Boolean(secret), hasApiKey: Boolean(resend) });
    return NextResponse.json({ error: "not_configured" }, { status: 401 });
  }

  // RAW body, before any parsing — the signature is over these exact bytes.
  const raw = await req.text();

  // Svix's three headers. Resend's `verify` takes the values, not a Headers object; a delivery
  // missing any of them cannot be authenticated, so it is rejected before we look at the body.
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    console.warn("[EMAIL][WEBHOOK][AUTH][MISSING_HEADERS]");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event;
  try {
    event = resend.webhooks.verify({
      payload: raw,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret: secret,
    });
  } catch (err) {
    console.warn("[EMAIL][WEBHOOK][AUTH][REJECTED]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    // Delivery/bounce/open events share this endpoint's signature scheme but are not inbound mail.
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const data = event.data;

    // Which of our issued addresses was this sent to? `to` can carry several recipients when a
    // customer CCs; the first one we recognise owns the conversation.
    let connection = null;
    for (const recipient of data.to ?? []) {
      connection = await getConnectionByInboundAddress(recipient);
      if (connection) break;
    }

    if (!connection) {
      console.warn("[EMAIL][WEBHOOK][UNKNOWN_RECIPIENT]", { to: data.to });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (connection.status === "revoked") {
      console.info("[EMAIL][WEBHOOK][REVOKED]", { connection_id: connection.id });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    /**
     * The webhook carries metadata only — sender, subject, attachment list. The body and the
     * headers that decide threading and automation live behind the Receiving API, so one fetch
     * is unavoidable before anything can be normalized.
     */
    const { data: full, error } = await resend.emails.receiving.get(data.email_id);
    if (error || !full) {
      console.error("[EMAIL][WEBHOOK][FETCH][FAILED]", { email_id: data.email_id, error: error?.message });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const headers = full.headers ?? {};
    const email: InboundEmail = {
      messageId: full.message_id ?? null,
      inReplyTo: headers["in-reply-to"] ?? headers["In-Reply-To"] ?? null,
      references: headers["references"] ?? headers["References"] ?? null,
      from: full.from ?? data.from ?? null,
      to: full.to ?? data.to ?? null,
      subject: full.subject ?? data.subject ?? null,
      text: full.text ?? null,
      html: full.html ?? null,
      headers,
      receivedAt: data.created_at ?? full.created_at ?? undefined,
      attachments: (full.attachments ?? []).map((file) => ({
        filename: file.filename ?? null,
        contentType: file.content_type ?? null,
        size: file.size ?? null,
      })),
    };

    /**
     * Gmail's forwarding handshake, finished on the customer's behalf.
     *
     * Checked before the adapter runs, because this mail must never become a Conversation — it
     * is plumbing correspondence, and a shop owner seeing "Google wrote in" would be a bug.
     */
    const confirmation = parseGmailConfirmation(email);
    if (confirmation) {
      const confirmed = await completeGmailForwarding(confirmation);
      await recordForwardConfirmation(connection.id, confirmation.code, confirmed);
      console.info("[EMAIL][WEBHOOK][GMAIL_CONFIRMATION]", {
        connection_id: connection.id,
        auto_confirmed: confirmed,
        has_code: Boolean(confirmation.code),
      });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const normalized = emailAdapter.normalizeInbound(
      { email, selfAddresses: selfAddressesFor(connection) },
      { orgId: connection.orgId, agentId: connection.assignedAgentId }
    );

    if (normalized.length === 0) {
      // Auto-replies, newsletters, bounces, and our own mail coming back. Received and
      // deliberately ignored — answering any of them is how an inbox starts a loop.
      console.info("[EMAIL][WEBHOOK][IGNORED]", { connection_id: connection.id, from: data.from });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    void markInbound(connection.id);

    for (const message of normalized) {
      const ingested = await ingestInboundMessage({
        ...message,
        // `connection_id` is the generic key `resolveOutboundTarget` already reads, so a human
        // replying from the Inbox works with no change to the reply path.
        meta: { ...message.meta, connection_id: connection.id },
      });

      if (!ingested.ok || !ingested.conversationId) {
        console.error("[EMAIL][WEBHOOK][INGEST][FAILED]", {
          connection_id: connection.id,
          org_id: connection.orgId,
        });
        continue;
      }

      console.info("[EMAIL][WEBHOOK][RECEIVED]", {
        org_id: connection.orgId,
        conversation_id: ingested.conversationId,
        thread: message.externalThreadId,
      });

      /**
       * Answer it — by default as a draft the owner sends, not as mail out the door.
       *
       * `statedName` is the display name off the `From:` header, which is whatever the sender's
       * mail client says. Passing it (rather than omitting it) is what puts recall on the
       * name-gated path, because an email address is only medium-strength identity.
       */
      await respondToInbound({
        orgId: connection.orgId,
        channel: "email",
        conversationId: ingested.conversationId,
        contactId: ingested.contactId,
        threadId: message.externalThreadId,
        connectionId: connection.id,
        agentId: connection.assignedAgentId,
        incoming: message.message.content,
        replyMode: connection.replyMode,
        statedName: message.contact.displayName ?? null,
      });
    }
  } catch (err) {
    // Authenticated and recorded-or-not, a retry would replay the same mail at the customer.
    console.error("[EMAIL][WEBHOOK][ERROR]", err instanceof Error ? err.message : String(err));
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
