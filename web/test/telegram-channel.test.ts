import { describe, it, expect, vi } from "vitest";

// The reply engine imports the service-role client at module load; these tests exercise its
// pure helpers only, so the client is stubbed rather than configured.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));
import { telegramAdapter, telegramDisplayName } from "@/lib/platform/adapters/telegram";
import { getChannelAdapter } from "@/lib/platform/adapters/registry";
import { canReplyOn, getTransport } from "@/lib/platform/transports/registry";
import { channelMeta } from "@/lib/platform/channels";
import { isPlausibleBotToken, describeToken } from "@/lib/telegram/api";
import { telegramWebhookUrl } from "@/lib/telegram/webhookUrl";
import { buildChatSystemPrompt } from "@/lib/platform/reply/prompt";
import { tidyReply, localNow } from "@/lib/platform/reply/engine";
import type { ReplyEmployee } from "@/lib/platform/reply/types";

const ctx = { orgId: "org-1", agentId: "agent-1" };

const update = (message: Record<string, unknown>) => ({ update_id: 7, message });

const privateMessage = update({
  message_id: 42,
  from: { id: 555, is_bot: false, first_name: "Ayşe", last_name: "Yılmaz", username: "ayse", language_code: "tr" },
  chat: { id: 555, type: "private" },
  date: 1_756_000_000,
  text: "Yarın saat 3'te randevu alabilir miyim?",
});

describe("telegram adapter — normalization", () => {
  it("maps a private message to one normalized inbound", () => {
    const [n] = telegramAdapter.normalizeInbound(privateMessage, ctx);
    expect(n.channel).toBe("telegram");
    expect(n.orgId).toBe("org-1");
    expect(n.agentId).toBe("agent-1");
    expect(n.externalThreadId).toBe("555");
    expect(n.contact.externalId).toBe("555");
    expect(n.contact.displayName).toBe("Ayşe Yılmaz");
    expect(n.message.role).toBe("user");
    expect(n.message.direction).toBe("inbound");
    expect(n.message.content).toContain("randevu");
    expect(n.transcriptForIntent).toBe(n.message.content);
  });

  it("scopes the message id to the chat, so idempotency survives per-chat id reuse", () => {
    const [a] = telegramAdapter.normalizeInbound(privateMessage, ctx);
    const [b] = telegramAdapter.normalizeInbound(
      update({ ...(privateMessage.message as object), chat: { id: 999, type: "private" } }),
      ctx
    );
    expect(a.message.externalMessageId).toBe("555:42");
    // Same message_id, different chat — must NOT collide.
    expect(b.message.externalMessageId).toBe("999:42");
  });

  it("reads Telegram's epoch SECONDS, not milliseconds", () => {
    const [n] = telegramAdapter.normalizeInbound(privateMessage, ctx);
    expect(n.message.createdAt).toBe(new Date(1_756_000_000 * 1000).toISOString());
  });

  it("keys the thread on the chat and the contact on the user (they differ in groups)", () => {
    const [n] = telegramAdapter.normalizeInbound(
      update({
        message_id: 1,
        from: { id: 555, is_bot: false, first_name: "Ayşe" },
        chat: { id: -100200, type: "group", title: "Shop" },
        date: 1_756_000_000,
        text: "hello",
      }),
      ctx
    );
    expect(n.externalThreadId).toBe("-100200");
    expect(n.contact.externalId).toBe("555");
  });

  it("uses a caption when there is no text", () => {
    const [n] = telegramAdapter.normalizeInbound(
      update({ message_id: 2, from: { id: 1, is_bot: false }, chat: { id: 1 }, caption: "is this in stock?" }),
      ctx
    );
    expect(n.message.content).toBe("is this in stock?");
  });

  it("ignores what it cannot answer: bot echoes, empty updates, non-text, missing org", () => {
    const botEcho = update({ message_id: 3, from: { id: 9, is_bot: true }, chat: { id: 9 }, text: "hi" });
    expect(telegramAdapter.normalizeInbound(botEcho, ctx)).toEqual([]);
    expect(telegramAdapter.normalizeInbound({ update_id: 1 }, ctx)).toEqual([]);
    expect(
      telegramAdapter.normalizeInbound(update({ message_id: 4, from: { id: 1 }, chat: { id: 1 }, sticker: {} }), ctx)
    ).toEqual([]);
    expect(telegramAdapter.normalizeInbound(privateMessage, { orgId: "" })).toEqual([]);
    expect(telegramAdapter.normalizeInbound(null, ctx)).toEqual([]);
    expect(telegramAdapter.normalizeInbound("nonsense", ctx)).toEqual([]);
  });

  it("carries the connection-agnostic meta the transport needs later", () => {
    const [n] = telegramAdapter.normalizeInbound(privateMessage, ctx);
    expect(n.meta).toMatchObject({ telegram_chat_id: "555", telegram_user_id: "555", telegram_username: "ayse" });
  });

  it("names a person from whatever Telegram gave", () => {
    expect(telegramDisplayName({ first_name: "Max" })).toBe("Max");
    expect(telegramDisplayName({ username: "max" })).toBe("@max");
    expect(telegramDisplayName({})).toBeNull();
    expect(telegramDisplayName(undefined)).toBeNull();
  });
});

describe("telegram registration — receive and reply are declared separately", () => {
  it("is registered as an adapter and a transport", () => {
    expect(getChannelAdapter("telegram")?.channel).toBe("telegram");
    expect(getTransport("telegram")?.channel).toBe("telegram");
    expect(channelMeta("telegram").adopted).toBe(true);
  });

  it("can reply on telegram, and cannot on a receive-only or unbuilt channel", () => {
    expect(canReplyOn("telegram")).toBe(true);
    // Instagram is adopted but has no transport — Meta has not granted the permission.
    expect(canReplyOn("instagram")).toBe(false);
    expect(canReplyOn("whatsapp")).toBe(false);
    expect(canReplyOn("voice")).toBe(false); // Vapi speaks inside the call; we never send.
  });

  it("stays out of customer-facing 'available' copy until proven live", () => {
    expect(channelMeta("telegram").productionReady).toBe(false);
  });
});

describe("bot token handling", () => {
  it("recognizes a BotFather token and rejects near-misses", () => {
    expect(isPlausibleBotToken("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw")).toBe(true);
    expect(isPlausibleBotToken("123456789:short")).toBe(false);
    expect(isPlausibleBotToken("not-a-token")).toBe(false);
    expect(isPlausibleBotToken("")).toBe(false);
    expect(isPlausibleBotToken(null)).toBe(false);
  });

  it("never renders the secret half of a token", () => {
    const token = "123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw";
    const described = describeToken(token);
    expect(described).toBe("bot 123456789");
    expect(described).not.toContain("AAHdq");
  });
});

describe("webhook URL", () => {
  const env = (over: Record<string, string>) => ({ ...over }) as NodeJS.ProcessEnv;

  it("addresses the connection in the path", () => {
    expect(telegramWebhookUrl("conn-1", env({ TELEGRAM_WEBHOOK_BASE_URL: "https://www.denku.io" }))).toBe(
      "https://www.denku.io/api/webhooks/telegram/conn-1"
    );
  });

  it("refuses a dev URL, so a laptop is never frozen into a customer's bot", () => {
    expect(telegramWebhookUrl("conn-1", env({ TELEGRAM_WEBHOOK_BASE_URL: "http://localhost:3000" }))).toBe("");
    expect(telegramWebhookUrl("conn-1", env({ NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000" }))).toBe("");
    expect(telegramWebhookUrl("conn-1", env({}))).toBe("");
  });

  it("falls back through the same base-URL chain the voice webhook uses", () => {
    expect(telegramWebhookUrl("c", env({ VAPI_WEBHOOK_BASE_URL: "https://www.denku.io/" }))).toBe(
      "https://www.denku.io/api/webhooks/telegram/c"
    );
  });
});

describe("chat system prompt", () => {
  const employee: ReplyEmployee = {
    id: "a1",
    name: "Denku",
    orgId: "org-1",
    orgName: "Bright Dental",
    language: "en",
    timezone: "America/New_York",
    systemPromptOverride: null,
    businessContext: { businessName: "Bright Dental", openingHours: "Mon–Fri 9–6", services: "Cleanings, whitening" },
  };

  it("carries the business's own facts, not generic assistant copy", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null });
    expect(p).toContain("Bright Dental");
    expect(p).toContain("Mon–Fri 9–6");
    expect(p).toContain("Telegram");
  });

  it("is written for a text thread, not a phone call", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null });
    expect(p).not.toMatch(/\bcaller\b/i);
    expect(p).not.toMatch(/voice assistant/i);
  });

  it("forbids asking for what the channel already told us", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: "Max" });
    expect(p).toContain("Max");
    expect(p).toMatch(/never ask for (their name|a phone number)/i);
  });

  it("refuses to let the AI claim work it did not do", () => {
    const p = buildChatSystemPrompt({ employee, channelLabel: "Telegram", contactName: null });
    expect(p).toMatch(/unless you actually called the matching tool/i);
    expect(p).toMatch(/Never invent a price/i);
  });

  it("puts the owner's instructions in, but after the facts", () => {
    const p = buildChatSystemPrompt({
      employee: { ...employee, systemPromptOverride: "Always mention the Tuesday discount." },
      channelLabel: "Telegram",
      contactName: null,
    });
    expect(p.indexOf("Bright Dental")).toBeLessThan(p.indexOf("Tuesday discount"));
  });
});

describe("reply shaping", () => {
  it("strips markdown a chat should not show", () => {
    expect(tidyReply("**Booked** for *Tuesday*")).toBe("Booked for Tuesday");
  });

  it("caps runaway output and trims", () => {
    expect(tidyReply("  hi  ")).toBe("hi");
    expect(tidyReply("x".repeat(5000)).length).toBe(1200);
  });

  it("renders the business's local time, or nothing when there is no zone", () => {
    expect(localNow(null)).toBeNull();
    expect(localNow("Not/AZone")).toBeNull();
    expect(localNow("America/New_York", new Date("2026-08-28T17:30:00Z"))).toContain("1:30");
  });
});
