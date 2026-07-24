import type { ChannelAdapter, NormalizedInbound, NormalizeContext } from "@/lib/platform/adapters/types";

/**
 * Instagram channel adapter (Sprint 4.5 — IG onto the shared abstractions).
 *
 * Maps one Instagram webhook `entry` (Messaging API / Messenger envelope) into normalized
 * inbound messages. The thread key is the customer's IG-scoped sender id (one Conversation
 * per customer thread). Inbound DMs → role "user"/inbound; business echoes (is_echo) →
 * role "assistant"/outbound, so the stored thread reflects both sides even though Denku is
 * receive-only (it does not SEND — no reply/AI logic here, per the Instagram landmine).
 *
 * Pure + deterministic + never throws (returns [] for non-message entries), per contract.
 */

interface IgMessaging {
  sender?: { id?: string | number };
  recipient?: { id?: string | number };
  timestamp?: number | string;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
  };
}

interface IgEntry {
  id?: string | number;
  time?: number;
  messaging?: unknown;
}

function toIso(ts: number | string | undefined): string | undefined {
  if (ts == null) return undefined;
  const n = typeof ts === "string" ? Number(ts) : ts;
  if (!Number.isFinite(n)) return undefined;
  // IG timestamps are epoch milliseconds.
  return new Date(n).toISOString();
}

export const instagramAdapter: ChannelAdapter = {
  channel: "instagram",
  normalizeInbound(raw: unknown, ctx: NormalizeContext): NormalizedInbound[] {
    const entry = raw as IgEntry | null;
    if (!entry || !ctx.orgId) return [];
    const messaging: IgMessaging[] = Array.isArray(entry.messaging) ? (entry.messaging as IgMessaging[]) : [];
    if (messaging.length === 0) return [];

    const out: NormalizedInbound[] = [];
    for (const m of messaging) {
      const text = m.message?.text;
      if (typeof text !== "string" || text.length === 0) continue; // ignore non-text events

      const isEcho = m.message?.is_echo === true;
      const senderId = m.sender?.id != null ? String(m.sender.id) : null;
      const recipientId = m.recipient?.id != null ? String(m.recipient.id) : null;
      // The customer is the non-business party: sender for inbound, recipient for echoes.
      const customerId = isEcho ? recipientId : senderId;
      if (!customerId) continue;

      out.push({
        channel: "instagram",
        orgId: ctx.orgId,
        agentId: ctx.agentId ?? null,
        externalThreadId: customerId, // one thread per customer
        contact: { externalId: customerId },
        message: {
          role: isEcho ? "assistant" : "user",
          direction: isEcho ? "outbound" : "inbound",
          content: text,
          externalMessageId: m.message?.mid ?? null,
          createdAt: toIso(m.timestamp),
        },
        // Chat text is the intent signal when a chat channel opts into the Intent stage.
        transcriptForIntent: isEcho ? null : text,
      });
    }
    return out;
  },
};
