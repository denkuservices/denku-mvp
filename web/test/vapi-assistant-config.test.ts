import { describe, it, expect } from "vitest";
import {
  buildAssistantConfigPatch,
  getVapiWebhookServerUrl,
  DENKU_TOOL_IDS,
  resolveLanguage,
  resolveVoice,
  resolveTranscriber,
  CALL_MAX_DURATION_SECONDS,
  CALL_SILENCE_TIMEOUT_SECONDS,
} from "@/lib/vapi/assistantConfig";

const [CREATE_TICKET, CREATE_APPT] = DENKU_TOOL_IDS;
const PROD = { VAPI_WEBHOOK_BASE_URL: "https://denku-mvp.vercel.app" };

describe("getVapiWebhookServerUrl (R-077)", () => {
  it("builds the canonical /api/webhooks/vapi URL from explicit env", () => {
    expect(getVapiWebhookServerUrl(PROD)).toBe("https://denku-mvp.vercel.app/api/webhooks/vapi");
  });
  it("prefers VAPI_WEBHOOK_BASE_URL, falls back to NEXT_PUBLIC_SITE_URL, trims trailing slash", () => {
    expect(getVapiWebhookServerUrl({ NEXT_PUBLIC_SITE_URL: "https://denku.io/" })).toBe(
      "https://denku.io/api/webhooks/vapi"
    );
  });
  it("returns '' for localhost so a dev URL is never frozen into live config (the R-077 bug)", () => {
    expect(getVapiWebhookServerUrl({ NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toBe("");
    expect(getVapiWebhookServerUrl({ VAPI_WEBHOOK_BASE_URL: "http://127.0.0.1:3000" })).toBe("");
  });
  it("returns '' when no base is configured", () => {
    expect(getVapiWebhookServerUrl({})).toBe("");
  });
});

describe("buildAssistantConfigPatch — toolId merge (R-050)", () => {
  it("attaches both Denku tools when the assistant has none (purchase-path case, R-050a)", () => {
    const patch = buildAssistantConfigPatch({ model: { provider: "openai", model: "gpt-4o" } }, {}, PROD);
    const model = patch.model as { toolIds: string[] };
    expect(model.toolIds).toEqual(expect.arrayContaining([CREATE_TICKET, CREATE_APPT]));
    expect(model.toolIds).toHaveLength(2);
  });

  it("MERGES rather than replaces — never drops existing tools (the syncAgentToVapi strip, R-050b)", () => {
    const patch = buildAssistantConfigPatch(
      { model: { provider: "openai", model: "gpt-4o", toolIds: ["custom-tool-xyz"] } },
      { systemPrompt: "new personalized prompt" }, // simulate a Settings personalization
      PROD
    );
    const model = patch.model as { toolIds: string[]; messages: unknown };
    expect(model.toolIds).toEqual(expect.arrayContaining(["custom-tool-xyz", CREATE_TICKET, CREATE_APPT]));
    // Personalizing the prompt must NOT wipe the tools:
    expect(model.toolIds).toContain(CREATE_TICKET);
    expect(model.messages).toEqual([{ role: "system", content: "new personalized prompt" }]);
  });

  it("is idempotent: re-running over its own output does not duplicate tool ids", () => {
    const first = buildAssistantConfigPatch({ model: { toolIds: [] } }, {}, PROD);
    const firstModel = first.model as { toolIds: string[] };
    const second = buildAssistantConfigPatch({ model: firstModel }, {}, PROD);
    const secondModel = second.model as { toolIds: string[] };
    expect(secondModel.toolIds).toHaveLength(DENKU_TOOL_IDS.length);
    expect(new Set(secondModel.toolIds).size).toBe(secondModel.toolIds.length);
  });

  it("preserves other model fields and existing messages when no new prompt is given", () => {
    const patch = buildAssistantConfigPatch(
      { model: { provider: "openai", model: "gpt-4o", temperature: 0.7, messages: [{ role: "system", content: "keep me" }] } },
      {},
      PROD
    );
    const model = patch.model as Record<string, unknown>;
    expect(model.provider).toBe("openai");
    expect(model.temperature).toBe(0.7);
    expect(model.messages).toEqual([{ role: "system", content: "keep me" }]);
  });
});

describe("buildAssistantConfigPatch — server / webhook (R-077 + Task 5 secret)", () => {
  it("sets server.url to the canonical webhook URL", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, {}, PROD);
    expect(patch.server).toEqual({ url: "https://denku-mvp.vercel.app/api/webhooks/vapi" });
  });

  it("includes the x-vapi-secret header when a secret is configured (Task 5 cross-dep)", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, {}, { ...PROD, VAPI_WEBHOOK_SECRET: "shh" });
    expect(patch.server).toEqual({
      url: "https://denku-mvp.vercel.app/api/webhooks/vapi",
      headers: { "x-vapi-secret": "shh" },
    });
  });

  it("omits server entirely when no safe base URL is configured (does not freeze localhost)", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, {}, { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" });
    expect(patch.server).toBeUndefined();
    // ...but still merges tools, so the model is always fixed even without a webhook URL.
    expect((patch.model as { toolIds: string[] }).toolIds).toHaveLength(2);
  });

  it("passes firstMessage through only when provided", () => {
    expect(buildAssistantConfigPatch({ model: {} }, { firstMessage: "Hi there" }, PROD).firstMessage).toBe("Hi there");
    expect(buildAssistantConfigPatch({ model: {} }, {}, PROD).firstMessage).toBeUndefined();
  });
});

describe("buildAssistantConfigPatch — voice/transcriber/caps (R-051 + R-052)", () => {
  it("ALWAYS sets the 15-min hard cap + 30s silence timeout (R-052, every path)", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, {}, PROD);
    expect(patch.maxDurationSeconds).toBe(CALL_MAX_DURATION_SECONDS);
    expect(patch.maxDurationSeconds).toBe(900);
    expect(patch.silenceTimeoutSeconds).toBe(30);
    expect(CALL_SILENCE_TIMEOUT_SECONDS).toBe(30);
  });

  it("sends a real voice + transcriber (no longer `none`, R-051) — English default", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, {}, PROD);
    expect(patch.voice).toEqual({ provider: "openai", voiceId: "alloy" });
    expect(patch.transcriber).toEqual({ provider: "deepgram", model: "nova-2", language: "en" });
  });

  it("uses Spanish voice + transcriber when the agent language is Spanish", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "es" }, PROD);
    expect(patch.voice).toEqual({ provider: "openai", voiceId: "nova" });
    expect((patch.transcriber as { language: string }).language).toBe("es");
  });

  it("an explicit voiceId overrides the language default", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "en", voiceId: "shimmer" }, PROD);
    expect(patch.voice).toEqual({ provider: "openai", voiceId: "shimmer" });
  });
});

describe("language / voice / transcriber resolvers (R-051)", () => {
  it("resolveLanguage normalizes to en/es (default en)", () => {
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("es-MX")).toBe("es");
    expect(resolveLanguage("en")).toBe("en");
    expect(resolveLanguage(null)).toBe("en");
    expect(resolveLanguage("fr")).toBe("en"); // unsupported → en
  });

  it("resolveVoice returns a language default or the explicit override", () => {
    expect(resolveVoice("en")).toEqual({ provider: "openai", voiceId: "alloy" });
    expect(resolveVoice("es")).toEqual({ provider: "openai", voiceId: "nova" });
    expect(resolveVoice("en", "echo")).toEqual({ provider: "openai", voiceId: "echo" });
  });

  it("resolveTranscriber is Deepgram nova-2 for the language", () => {
    expect(resolveTranscriber("es")).toEqual({ provider: "deepgram", model: "nova-2", language: "es" });
  });
});
