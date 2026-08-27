import { NextRequest, NextResponse } from "next/server";
import { getConnectionById, markInbound } from "@/lib/telegram/connections";
import { telegramAdapter } from "@/lib/platform/adapters/telegram";
import { ingestInboundMessage } from "@/lib/platform/ingest";
import { respondToInbound } from "@/lib/platform/reply/respond";

export const dynamic = "force-dynamic";

/**
 * Telegram webhook — receive, record, and answer.
 *
 * **Authentication.** Telegram does not sign the body. What it does is echo back the
 * `secret_token` we registered with `setWebhook`, in the `X-Telegram-Bot-Api-Secret-Token`
 * header. That echo is therefore the entire authentication for this endpoint, and it is
 * compared in constant time against the secret stored on the connection this URL names.
 * The connection id in the path is an addressing detail, not a credential: Telegram's update
 * payload says nothing about which bot received it, so without the path we would have to guess
 * among every stored token. Unlike the Vapi webhook (landmine #1) there is no staged
 * observe-only mode — this channel has never had traffic, so it enforces from its first request.
 *
 * **Why it always answers 200 after auth passes.** Telegram retries a non-2xx delivery, and a
 * retry of a message we already recorded and answered would mean a second reply to the customer.
 * Once the request is authenticated, every downstream failure is logged and swallowed. The two
 * exceptions are the ones where a retry is genuinely the right cure: an unknown connection and a
 * bad secret both answer 401 with no write.
 *
 * **Why there is no raw-events table.** Instagram has one because it persists what it cannot yet
 * process. Telegram is processed on arrival: the message IS the record, in `conversations` /
 * `messages`, where the owner can read it. A second copy of every customer message would be PII
 * stored for nobody's benefit.
 *
 * **Not gated by `PLATFORM_MODEL_ENABLED`.** That flag protects voice's byte-for-byte legacy
 * behaviour during dual-write. Telegram has no legacy store to be byte-for-byte with — the
 * shared model is its only home, so gating it would mean a channel that receives nothing.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ connectionId: string }> }) {
  const { connectionId } = await ctx.params;

  const connection = await getConnectionById(connectionId);
  if (!connection) {
    console.warn("[TELEGRAM][WEBHOOK][UNKNOWN_CONNECTION]", { connectionId });
    return NextResponse.json({ error: "unknown_connection" }, { status: 401 });
  }

  const presented = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!presented || !timingSafeEqual(presented, connection.webhookSecret)) {
    console.warn("[TELEGRAM][WEBHOOK][AUTH][REJECTED]", { connectionId, hasHeader: Boolean(presented) });
    return NextResponse.json({ error: "invalid_secret" }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    // Malformed JSON from an authenticated caller is not worth a retry storm.
    console.warn("[TELEGRAM][WEBHOOK][BAD_JSON]", { connectionId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const normalized = telegramAdapter.normalizeInbound(update, {
      orgId: connection.orgId,
      agentId: connection.assignedAgentId,
    });

    if (normalized.length === 0) {
      // Stickers, joins, edits, bot echoes — received and deliberately ignored.
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    void markInbound(connection.id);

    for (const message of normalized) {
      const ingested = await ingestInboundMessage({
        ...message,
        // The transport needs to know which of the org's bots to answer through, and the
        // conversation is where that survives past this request.
        meta: { ...message.meta, telegram_connection_id: connection.id },
      });

      if (!ingested.ok || !ingested.conversationId) {
        console.error("[TELEGRAM][WEBHOOK][INGEST][FAILED]", {
          connectionId,
          org_id: connection.orgId,
        });
        continue;
      }

      console.info("[TELEGRAM][WEBHOOK][RECEIVED]", {
        org_id: connection.orgId,
        conversation_id: ingested.conversationId,
        chat: message.externalThreadId,
      });

      await respondToInbound({
        orgId: connection.orgId,
        channel: "telegram",
        conversationId: ingested.conversationId,
        contactId: ingested.contactId,
        threadId: message.externalThreadId,
        connectionId: connection.id,
        agentId: connection.assignedAgentId,
        incoming: message.message.content,
      });
    }
  } catch (err) {
    // Authenticated and recorded-or-not, a retry would replay the same message at the customer.
    console.error("[TELEGRAM][WEBHOOK][ERROR]", {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
