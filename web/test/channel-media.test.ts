import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn(), storage: { from: vi.fn() } } }));

/**
 * Storage and the models are mocked wholesale.
 *
 * Perception's job is to turn bytes into a sentence and put that sentence where every reader will
 * find it. What the vision model actually says is not this suite's business — what IS its business
 * is that the sentence lands in `content`, that the record lands in `meta.media`, that a file we
 * could not read never reads as one we could, and that a redelivered webhook does not pay for the
 * same photo twice. All four are assertable with a fake describer.
 */
vi.mock("@/lib/llm/multimodal", () => ({
  describeImage: vi.fn(async () => ({ ok: true, text: "a cracked black phone screen" })),
  transcribeAudio: vi.fn(async () => ({ ok: true, text: "yarın saat üçte gelebilir miyim" })),
  describeVideo: vi.fn(async () => ({ ok: false, text: null, error: "unsupported_by_provider" })),
  extensionFor: (mime: string) => (mime.includes("jpeg") ? "jpg" : "bin"),
}));

vi.mock("@/lib/platform/media/store", () => ({
  storeInboundMedia: vi.fn(async () => "org-1/conv-1/stored.jpg"),
  signedMediaUrl: vi.fn(async () => "https://signed.example/file"),
  fetchMediaBytes: vi.fn(async () => null),
  urlMediaResolver: vi.fn(),
  CHANNEL_MEDIA_BUCKET: "channel-media",
}));

import { telegramAdapter, telegramAttachments } from "@/lib/platform/adapters/telegram";
import { instagramAdapter } from "@/lib/platform/adapters/instagram";
import { emailAdapter, type InboundEmail } from "@/lib/platform/adapters/email";
import { webChatAdapter } from "@/lib/platform/adapters/webchat";
import { kindForMime, isUnderstandableMime, MAX_ATTACHMENTS_PER_MESSAGE } from "@/lib/platform/media/types";
import {
  composeMessageContent,
  processInboundMedia,
  renderAttachment,
} from "@/lib/platform/media/understand";
import { isOwnedUpload, sanitizeFilename, webChatAttachmentsFrom, webChatUploadKind } from "@/lib/webchat/uploads";
import { buildChatSystemPrompt } from "@/lib/platform/reply/prompt";
import { channelMeta, CHANNEL_ORDER } from "@/lib/platform/channels";
import { ingestInboundMessage } from "@/lib/platform/ingest";
import { makeFakeDb, resetFakeIds, type FakeDb } from "./helpers/fakePlatformDb";
import type { ReplyEmployee } from "@/lib/platform/reply/types";

const jpeg = { mime: "image/jpeg", base64: "AAAA", size: 1024 };

describe("mime classification", () => {
  it("routes each family to the sense that can read it", () => {
    expect(kindForMime("image/jpeg")).toBe("image");
    expect(kindForMime("audio/ogg")).toBe("audio");
    expect(kindForMime("video/mp4")).toBe("video");
    expect(kindForMime("application/pdf")).toBe("file");
    expect(kindForMime(null)).toBe("file");
  });

  it("only sends formats a model actually accepts", () => {
    expect(isUnderstandableMime("image/png")).toBe(true);
    expect(isUnderstandableMime("audio/ogg")).toBe(true);
    // A PDF is stored and shown; it is not sent to a vision model that would reject it.
    expect(isUnderstandableMime("application/pdf")).toBe(false);
    expect(isUnderstandableMime("application/x-msdownload")).toBe(false);
  });
});

describe("telegram adapter — photos and voice notes", () => {
  const base = { chat: { id: 42, type: "private" }, from: { id: 7, first_name: "Ayşe" }, date: 1_756_000_000 };

  it("takes the LARGEST photo size and only that one", () => {
    const attachments = telegramAttachments({
      ...base,
      photo: [
        { file_id: "small", file_size: 900 },
        { file_id: "medium", file_size: 12_000 },
        { file_id: "large", file_size: 98_000 },
      ],
    });
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ kind: "image", ref: "large", mime: "image/jpeg" });
  });

  it("marks a voice note as audio and keeps its duration", () => {
    const [voice] = telegramAttachments({ ...base, voice: { file_id: "v1", duration: 14, mime_type: "audio/ogg" } });
    expect(voice).toMatchObject({ kind: "audio", ref: "v1", durationSeconds: 14 });
  });

  it("a photo with no caption is a message now, not a dropped update", () => {
    const [msg] = telegramAdapter.normalizeInbound(
      { update_id: 1, message: { ...base, message_id: 5, photo: [{ file_id: "p1", file_size: 4000 }] } },
      { orgId: "o1", agentId: null }
    );
    expect(msg).toBeTruthy();
    expect(msg.message.attachments).toHaveLength(1);
    expect(msg.message.content).toBe("");
  });

  it("a caption rides along with the photo", () => {
    const [msg] = telegramAdapter.normalizeInbound(
      {
        update_id: 1,
        message: { ...base, message_id: 6, caption: "bu parça kırıldı", photo: [{ file_id: "p2", file_size: 1 }] },
      },
      { orgId: "o1", agentId: null }
    );
    expect(msg.message.content).toBe("bu parça kırıldı");
    expect(msg.message.attachments).toHaveLength(1);
  });

  it("a sticker becomes its emoji rather than a vision call", () => {
    const [msg] = telegramAdapter.normalizeInbound(
      { update_id: 1, message: { ...base, message_id: 7, sticker: { file_id: "s1", emoji: "👍" } } },
      { orgId: "o1", agentId: null }
    );
    expect(msg.message.content).toBe("👍");
    expect(msg.message.attachments).toEqual([]);
  });

  it("still ignores an update with nothing said and nothing attached", () => {
    expect(
      telegramAdapter.normalizeInbound({ update_id: 1, message: { ...base, message_id: 8 } }, { orgId: "o1" })
    ).toEqual([]);
  });
});

describe("instagram adapter — receive-only, but no longer blind", () => {
  it("carries an image attachment and drops a story share", () => {
    const [msg] = instagramAdapter.normalizeInbound(
      {
        id: "biz",
        messaging: [
          {
            sender: { id: "cust" },
            recipient: { id: "biz" },
            timestamp: 1_756_000_000_000,
            message: {
              mid: "m1",
              attachments: [
                { type: "image", payload: { url: "https://cdn.example/a.jpg" } },
                { type: "share", payload: { url: "https://cdn.example/post" } },
              ],
            },
          },
        ],
      },
      { orgId: "o1", agentId: null }
    );
    expect(msg.message.attachments).toHaveLength(1);
    expect(msg.message.attachments?.[0]).toMatchObject({ kind: "image", url: "https://cdn.example/a.jpg" });
  });

  it("refuses a non-https attachment url outright", () => {
    const [msg] = instagramAdapter.normalizeInbound(
      {
        id: "biz",
        messaging: [
          {
            sender: { id: "cust" },
            recipient: { id: "biz" },
            message: { mid: "m2", text: "hi", attachments: [{ type: "image", payload: { url: "http://cdn/a.jpg" } }] },
          },
        ],
      },
      { orgId: "o1", agentId: null }
    );
    expect(msg.message.attachments).toEqual([]);
  });
});

describe("email adapter — what is worth reading", () => {
  const mail = (attachments: InboundEmail["attachments"]): InboundEmail => ({
    messageId: "<m1@x>",
    from: "Ayşe <ayse@example.com>",
    subject: "Fatura",
    text: "Ekte fatura var",
    headers: {},
    attachments,
  });

  it("skips inline parts — a signature logo is not a customer showing us something", () => {
    const [msg] = emailAdapter.normalizeInbound(
      {
        email: mail([
          { id: "a1", filename: "logo.png", contentType: "image/png", size: 900, inline: true },
          { id: "a2", filename: "fatura.pdf", contentType: "application/pdf", size: 40_000, inline: false },
        ]),
      },
      { orgId: "o1" }
    );
    expect(msg.message.attachments).toHaveLength(1);
    expect(msg.message.attachments?.[0]).toMatchObject({ ref: "a2", kind: "file" });
  });

  it("drops an attachment with no id, because it could never be fetched", () => {
    const [msg] = emailAdapter.normalizeInbound(
      { email: mail([{ filename: "x.png", contentType: "image/png", size: 10 }]) },
      { orgId: "o1" }
    );
    expect(msg.message.attachments).toEqual([]);
  });
});

describe("web chat uploads — the only channel where the sender is a stranger", () => {
  it("accepts photos and audio, refuses everything else", () => {
    expect(webChatUploadKind("image/png")).toBe("image");
    expect(webChatUploadKind("audio/webm")).toBe("audio");
    // SVG is script. A PDF is fine elsewhere but not from an anonymous browser.
    expect(webChatUploadKind("image/svg+xml")).toBeNull();
    expect(webChatUploadKind("application/pdf")).toBeNull();
  });

  it("a storage key from another session or another org is not this visitor's file", () => {
    expect(isOwnedUpload("org-1/webchat/sess-1/a.jpg", "org-1", "sess-1")).toBe(true);
    expect(isOwnedUpload("org-1/webchat/sess-2/a.jpg", "org-1", "sess-1")).toBe(false);
    expect(isOwnedUpload("org-2/webchat/sess-1/a.jpg", "org-1", "sess-1")).toBe(false);
    expect(isOwnedUpload("org-1/webchat/sess-1/../../org-2/x.jpg", "org-1", "sess-1")).toBe(false);
  });

  it("drops a foreign reference silently rather than reading a stranger's file back", () => {
    const attachments = webChatAttachmentsFrom(
      [
        { ref: "org-1/webchat/sess-1/mine.jpg", mime: "image/jpeg" },
        { ref: "org-9/webchat/sess-9/theirs.jpg", mime: "image/jpeg" },
      ],
      "org-1",
      "sess-1"
    );
    expect(attachments).toHaveLength(1);
    expect(attachments[0].ref).toContain("mine.jpg");
    // Already ours, so perception must not store a second copy.
    expect(attachments[0].storagePath).toBe(attachments[0].ref);
  });

  it("a filename chosen by a stranger cannot carry a path or a control character", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("in voice.pdf")).toBe("invoice.pdf");
  });

  it("a photo with no caption is a valid web chat message", () => {
    const [msg] = webChatAdapter.normalizeInbound(
      {
        sessionId: "sess-1",
        visitorId: "vis-1",
        text: "",
        attachments: [{ kind: "image", mime: "image/jpeg", ref: "org-1/webchat/sess-1/a.jpg" }],
      },
      { orgId: "org-1" }
    );
    expect(msg).toBeTruthy();
    expect(msg.message.attachments).toHaveLength(1);
  });
});

describe("rendition — what every reader downstream sees", () => {
  it("an image reads as sight, a voice note as the customer's own words", () => {
    expect(
      renderAttachment({
        kind: "image",
        mime: "image/jpeg",
        filename: null,
        size: 1,
        durationSeconds: null,
        status: "understood",
        storagePath: "p",
        understanding: "a cracked screen",
      })
    ).toBe("[image] a cracked screen");

    expect(
      renderAttachment({
        kind: "audio",
        mime: "audio/ogg",
        filename: null,
        size: 1,
        durationSeconds: 12,
        status: "understood",
        storagePath: "p",
        understanding: "yarın gelebilir miyim",
      })
    ).toBe("[voice message] yarın gelebilir miyim");
  });

  it("a file we could not read says so, and tells the model not to guess", () => {
    const line = renderAttachment({
      kind: "image",
      mime: "image/jpeg",
      filename: null,
      size: 1,
      durationSeconds: null,
      status: "failed",
      storagePath: null,
      understanding: null,
    });
    expect(line).toContain("could not open");
    expect(line.toLowerCase()).toContain("do not guess");
  });

  it("keeps the customer's words first and the observation second", () => {
    expect(composeMessageContent("bu ne kadar", "[image] a blue mug")).toBe("bu ne kadar\n\n[image] a blue mug");
    expect(composeMessageContent("", "[image] a blue mug")).toBe("[image] a blue mug");
    expect(composeMessageContent("sadece yazı", "")).toBe("sadece yazı");
  });
});

describe("processInboundMedia", () => {
  const input = (attachments: number, resolve = vi.fn(async () => jpeg)) => ({
    orgId: "org-1",
    conversationId: "conv-1",
    caption: "",
    resolve,
    attachments: Array.from({ length: attachments }, (_, i) => ({
      kind: "image" as const,
      mime: "image/jpeg",
      ref: `f${i}`,
    })),
  });

  it("describes what it can and records where the copy went", async () => {
    const result = await processInboundMedia(input(1) as never);
    expect(result.understood).toBe(true);
    expect(result.records[0]).toMatchObject({ status: "understood", storagePath: "org-1/conv-1/stored.jpg" });
    expect(result.rendition).toBe("[image] a cracked black phone screen");
  });

  it("a resolver that comes back empty produces an honest record, never a lost message", async () => {
    const result = await processInboundMedia(input(1, vi.fn(async () => null)) as never);
    expect(result.understood).toBe(false);
    expect(result.records[0].status).toBe("failed");
    expect(result.rendition).toContain("could not open");
  });

  it("refuses on the declared size before spending a fetch on it", async () => {
    const resolve = vi.fn(async () => jpeg);
    const result = await processInboundMedia({
      orgId: "org-1",
      conversationId: "conv-1",
      caption: "",
      resolve,
      attachments: [{ kind: "image", mime: "image/jpeg", ref: "huge", size: 40 * 1024 * 1024 }],
    } as never);
    expect(resolve).not.toHaveBeenCalled();
    expect(result.records[0].status).toBe("too_large");
  });

  it("caps how many files one message may spend a model call on", async () => {
    const resolve = vi.fn(async () => jpeg);
    const result = await processInboundMedia(input(MAX_ATTACHMENTS_PER_MESSAGE + 3, resolve) as never);
    expect(resolve).toHaveBeenCalledTimes(MAX_ATTACHMENTS_PER_MESSAGE);
    // The extras are still recorded — the owner sees that they arrived.
    expect(result.records).toHaveLength(MAX_ATTACHMENTS_PER_MESSAGE + 3);
    expect(result.records[MAX_ATTACHMENTS_PER_MESSAGE].error).toBe("over_attachment_limit");
  });
});

describe("ingest — perception is part of the message, not beside it", () => {
  let db: FakeDb;
  beforeEach(() => {
    resetFakeIds();
    db = makeFakeDb();
  });

  const photoMessage = (mid: string) =>
    telegramAdapter.normalizeInbound(
      {
        update_id: 1,
        message: {
          message_id: Number(mid),
          chat: { id: 99, type: "private" },
          from: { id: 5, first_name: "Ayşe" },
          date: 1_756_000_000,
          caption: "bu ne kadar",
          photo: [{ file_id: "p1", file_size: 4000 }],
        },
      },
      { orgId: "org-1", agentId: null }
    )[0];

  it("folds the description into the stored body and the record into meta", async () => {
    const resolveMedia = vi.fn(async () => jpeg);
    const res = await ingestInboundMessage(photoMessage("1"), { db: db as never, resolveMedia });

    expect(res.ok).toBe(true);
    expect(res.content).toBe("bu ne kadar\n\n[image] a cracked black phone screen");
    expect(res.media[0].status).toBe("understood");

    const stored = db.tables.messages[0];
    expect(stored.content).toBe(res.content);
    expect(stored.meta.media).toHaveLength(1);
  });

  it("a redelivered photo costs one read, not a second vision call", async () => {
    const resolveMedia = vi.fn(async () => jpeg);
    const first = await ingestInboundMessage(photoMessage("2"), { db: db as never, resolveMedia });
    const again = await ingestInboundMessage(photoMessage("2"), { db: db as never, resolveMedia });

    expect(resolveMedia).toHaveBeenCalledTimes(1);
    expect(again.messageId).toBe(first.messageId);
    expect(again.content).toBe(first.content);
    expect(db.tables.messages).toHaveLength(1);
  });

  it("without a resolver an attachment-only message is still recorded, never dropped", async () => {
    const bare = telegramAdapter.normalizeInbound(
      {
        update_id: 1,
        message: {
          message_id: 3,
          chat: { id: 99, type: "private" },
          from: { id: 5, first_name: "Ayşe" },
          date: 1_756_000_000,
          photo: [{ file_id: "p9", file_size: 10 }],
        },
      },
      { orgId: "org-1", agentId: null }
    )[0];

    const res = await ingestInboundMessage(bare, { db: db as never });
    expect(res.ok).toBe(true);
    expect(res.content).toBe("[image] received.");
    expect(db.tables.messages).toHaveLength(1);
  });
});

describe("the registry tells the truth about what each channel can perceive", () => {
  it("every chat channel that carries attachments can read them", () => {
    for (const channel of CHANNEL_ORDER) {
      const meta = channelMeta(channel);
      if (meta.kind !== "chat") continue;
      expect(meta.capabilities.imageUnderstanding).toBe(meta.capabilities.attachments);
    }
  });

  it("voice perceives nothing here — a call is understood inside the call", () => {
    const voice = channelMeta("voice").capabilities;
    expect(voice.imageUnderstanding).toBe(false);
    expect(voice.audioUnderstanding).toBe(false);
  });
});

describe("the prompt only claims a sense the channel actually has", () => {
  const employee: ReplyEmployee = {
    id: "e1",
    name: "Ada",
    orgId: "org-1",
    orgName: "Denku Test",
    language: null,
    timezone: null,
    systemPromptOverride: null,
    firstMessage: null,
    businessContext: null,
  };

  it("explains the bracketed lines where perception runs", () => {
    const prompt = buildChatSystemPrompt({
      employee,
      channelLabel: "Telegram",
      contactName: null,
      canPerceiveMedia: true,
    });
    expect(prompt).toContain("[image]");
    expect(prompt).toContain("[voice message]");
    expect(prompt).toContain("Never guess what it showed.");
  });

  it("says nothing about photos on a channel that cannot carry one", () => {
    const prompt = buildChatSystemPrompt({
      employee,
      channelLabel: "SMS",
      contactName: null,
      canPerceiveMedia: false,
    });
    expect(prompt).not.toContain("[image]");
  });
});
