import { describe, it, expect, vi } from "vitest";

// The transport registry pulls in Telegram's, which imports the fail-fast service-role client.
// Nothing here touches a database — the web transport sends nothing over the network at all.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { webChatAdapter, MAX_WEB_CHAT_MESSAGE_CHARS } from "@/lib/platform/adapters/webchat";
import { getChannelAdapter } from "@/lib/platform/adapters/registry";
import { canReplyOn, getTransport } from "@/lib/platform/transports/registry";

const ctx = { orgId: "org-1", agentId: "agent-1" };

describe("web chat adapter", () => {
  it("normalises a message into the shared model", () => {
    const [out] = webChatAdapter.normalizeInbound(
      {
        sessionId: "sess-1",
        visitorId: "vis-1",
        text: "  Do you deliver on Sundays?  ",
        clientMessageId: "c1",
        pageUrl: "https://shop.com/delivery",
      },
      ctx
    );

    expect(out.channel).toBe("web");
    expect(out.orgId).toBe("org-1");
    expect(out.agentId).toBe("agent-1");
    // The thread is the session, not the visitor — see the adapter's note.
    expect(out.externalThreadId).toBe("sess-1");
    expect(out.contact.externalId).toBe("vis-1");
    expect(out.message.content).toBe("Do you deliver on Sundays?");
    expect(out.message.direction).toBe("inbound");
    // Scoped by session, so a client-chosen id cannot collide across visitors.
    expect(out.message.externalMessageId).toBe("sess-1:c1");
    expect(out.meta?.web_chat_page_url).toBe("https://shop.com/delivery");
  });

  it("never invents a name for an anonymous visitor", () => {
    // A placeholder like "Website visitor" would be written into `contacts` and later read back
    // by recall as if the person had said it.
    const [out] = webChatAdapter.normalizeInbound(
      { sessionId: "s", visitorId: "v", text: "hi" },
      ctx
    );
    expect(out.contact.displayName).toBeNull();
  });

  it("returns nothing it cannot use, rather than storing an empty message", () => {
    expect(webChatAdapter.normalizeInbound(null, ctx)).toEqual([]);
    expect(webChatAdapter.normalizeInbound({ sessionId: "s", visitorId: "v", text: "   " }, ctx)).toEqual([]);
    expect(webChatAdapter.normalizeInbound({ sessionId: "", visitorId: "v", text: "hi" }, ctx)).toEqual([]);
    expect(webChatAdapter.normalizeInbound({ sessionId: "s", visitorId: "", text: "hi" }, ctx)).toEqual([]);
    expect(webChatAdapter.normalizeInbound({ sessionId: "s", visitorId: "v", text: "hi" }, { orgId: "" })).toEqual([]);
  });

  it("caps what a public endpoint can write into one row", () => {
    const [out] = webChatAdapter.normalizeInbound(
      { sessionId: "s", visitorId: "v", text: "x".repeat(50_000) },
      ctx
    );
    expect(out.message.content.length).toBe(MAX_WEB_CHAT_MESSAGE_CHARS);
  });

  it("omits the external id when the client did not supply one, rather than inventing one", () => {
    // A synthetic id would make `appendMessage` think two different messages were the same one.
    const [out] = webChatAdapter.normalizeInbound({ sessionId: "s", visitorId: "v", text: "hi" }, ctx);
    expect(out.message.externalMessageId).toBeNull();
  });
});

describe("web chat is wired into the platform", () => {
  it("is registered as an adapter, so ingest can record it", () => {
    expect(getChannelAdapter("web")).toBe(webChatAdapter);
  });

  it("has a transport, so a person can take the conversation over from the Inbox", () => {
    expect(getTransport("web")).toBeDefined();
    expect(canReplyOn("web")).toBe(true);
  });

  it("mints a per-reply id so a stored reply cannot be duplicated", async () => {
    const transport = getTransport("web")!;
    const target = { orgId: "o", conversationId: "c", threadId: "sess-1", connectionId: "conn-1" };

    const first = await transport.sendText(target, "hello");
    const second = await transport.sendText(target, "hello");

    expect(first.ok).toBe(true);
    expect(first.externalMessageId).toMatch(/^sess-1:out:/);
    expect(second.externalMessageId).not.toBe(first.externalMessageId);

    // There is no provider to send to, but there is still nothing to send when the thread has
    // no address or the text is empty.
    expect((await transport.sendText({ ...target, threadId: "" }, "hi")).ok).toBe(false);
    expect((await transport.sendText(target, "   ")).ok).toBe(false);
  });
});
