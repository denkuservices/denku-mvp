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
import { SETUP_LANGUAGES } from "@/app/(app)/dashboard/_platform/team/setupFields";
import { LANGUAGE_OPTIONS } from "@/app/(app)/dashboard/settings/_lib/options";

const [CREATE_TICKET, CREATE_APPT, IDENTIFY_CALLER] = DENKU_TOOL_IDS;
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
  it("attaches every Denku tool when the assistant has none (purchase-path case, R-050a)", () => {
    const patch = buildAssistantConfigPatch({ model: { provider: "openai", model: "gpt-4o" } }, {}, PROD);
    const model = patch.model as { toolIds: string[] };
    expect(model.toolIds).toEqual(expect.arrayContaining([CREATE_TICKET, CREATE_APPT, IDENTIFY_CALLER]));
    // Counted from the registry, not hardcoded: adding a tool is a one-line change there, and a
    // test that says "2" turns that into a puzzle in an unrelated file.
    expect(model.toolIds).toHaveLength(DENKU_TOOL_IDS.length);
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
    expect((patch.model as { toolIds: string[] }).toolIds).toHaveLength(DENKU_TOOL_IDS.length);
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
    expect(patch.voice).toEqual({ provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" });
    expect(patch.transcriber).toEqual({ provider: "deepgram", model: "nova-3", language: "en" });
  });

  it("uses Spanish voice + transcriber when the agent language is Spanish", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "es" }, PROD);
    expect(patch.voice).toEqual({ provider: "openai", voiceId: "nova" });
    expect((patch.transcriber as { language: string }).language).toBe("es");
  });

  it("a chosen voice replaces the whole voice object, provider included", () => {
    // The customer picks from a catalogue, and an entry names its own provider and model. Keeping
    // the default provider and swapping only the id is how you ask ElevenLabs for an Azure voice.
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "tr", voiceId: "tr-TR-EmelNeural" }, PROD);
    expect(patch.voice).toEqual({ provider: "azure", voiceId: "tr-TR-EmelNeural" });
  });

  it("carries the TTS model, because with ElevenLabs the model is what speaks the language", () => {
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "tr", voiceId: "matilda" }, PROD);
    expect(patch.voice).toEqual({
      provider: "11labs",
      voiceId: "matilda",
      model: "eleven_turbo_v2_5",
    });
  });

  it("falls back to the language default rather than passing an unknown voice through", () => {
    // A voice we cannot describe is a voice we cannot promise. Forwarding a bare id we have never
    // heard of is how an assistant ends up unconfigured after a Vapi 400.
    const patch = buildAssistantConfigPatch({ model: {} }, { language: "en", voiceId: "shimmer" }, PROD);
    expect(patch.voice).toEqual({ provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" });
  });

  it("leaves the assistant's model alone unless a tier was asked for", () => {
    const untouched = buildAssistantConfigPatch({ model: { model: "gpt-4o" } }, { language: "en" }, PROD);
    expect((untouched.model as { model?: string }).model).toBe("gpt-4o");

    const upgraded = buildAssistantConfigPatch({ model: {} }, { language: "en", modelTier: "advanced" }, PROD);
    expect((upgraded.model as { model?: string }).model).toBe("gpt-4.1");
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
    expect(resolveVoice("en")).toEqual({ provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" });
    expect(resolveVoice("es")).toEqual({ provider: "openai", voiceId: "nova" });
    // An id the catalogue knows replaces the object outright; one it does not is ignored.
    expect(resolveVoice("tr", "sarah")).toEqual({
      provider: "11labs",
      voiceId: "sarah",
      model: "eleven_turbo_v2_5",
    });
    expect(resolveVoice("en", "echo")).toEqual({ provider: "vapi", voiceId: "Elliot", version: 2, language: "auto" });
  });

  it("resolveTranscriber is Deepgram, nova-3 for English and nova-2 for Spanish", () => {
    // English moved to nova-3 for proper nouns ("Gaye" transcribed as "Joya" on a real call).
    // Spanish stays on nova-2 deliberately — see TRANSCRIBER_MODEL_BY_LANGUAGE.
    expect(resolveTranscriber("en")).toEqual({ provider: "deepgram", model: "nova-3", language: "en" });
    expect(resolveTranscriber("es")).toEqual({ provider: "deepgram", model: "nova-2", language: "es" });
  });
});

/**
 * R-135 — the Setup editor stores the language NAME; onboarding stores the ISO CODE.
 *
 * The original resolver tested `startsWith("es")`, which the code "es" satisfies and the name
 * "Spanish" does not — so a customer who picked Spanish got an English voice and an English
 * transcriber while the UI kept showing "Spanish". The tests above missed it for one reason:
 * they only ever passed ISO codes, never the value the editor actually persists.
 */
describe("resolveLanguage understands both spellings (R-135)", () => {
  it("resolves the display NAME the Setup editor persists", () => {
    expect(resolveLanguage("Spanish")).toBe("es");
    expect(resolveLanguage("spanish")).toBe("es");
    expect(resolveLanguage("  Spanish  ")).toBe("es");
    expect(resolveLanguage("Español")).toBe("es");
    expect(resolveLanguage("English")).toBe("en");
  });

  it("still resolves the ISO code onboarding persists, including locale forms", () => {
    expect(resolveLanguage("es")).toBe("es");
    expect(resolveLanguage("es-ES")).toBe("es");
    expect(resolveLanguage("es_MX")).toBe("es");
    expect(resolveLanguage("en-GB")).toBe("en");
  });

  it("falls back to en for empty and unknown values rather than breaking the call", () => {
    expect(resolveLanguage(null)).toBe("en");
    expect(resolveLanguage(undefined)).toBe("en");
    expect(resolveLanguage("")).toBe("en");
    expect(resolveLanguage("   ")).toBe("en");
    expect(resolveLanguage("Klingon")).toBe("en");
  });

  it("does not match a language merely because it starts with the letters 'es'", () => {
    // The old implementation's failure mode, inverted: "Estonian" is not Spanish.
    expect(resolveLanguage("Estonian")).toBe("en");
  });

  /**
   * The parity assertion. The defect class is "the editor's option list and the resolver
   * disagree", and only this test prevents it recurring: adding a language to the picker
   * without teaching the resolver (and the voice map) fails here rather than in production.
   */
  /**
   * The workspace default feeds every new employee, so it is the same contract one level up.
   * Turkish lived here after being removed from the Setup editor — a workspace set to Turkish
   * silently produced English-speaking employees while three screens claimed otherwise.
   */
  it("every workspace default language also resolves to a DISTINCT supported code", () => {
    const codes = LANGUAGE_OPTIONS.map((o) => resolveLanguage(o.value));
    expect(new Set(codes).size).toBe(LANGUAGE_OPTIONS.length);
    for (const o of LANGUAGE_OPTIONS) {
      expect(resolveTranscriber(o.value).language, `${o.label} must transcribe as itself`).toBe(
        resolveLanguage(o.value)
      );
    }
  });

  it("both language pickers offer the same set of languages", () => {
    // Two pickers over one capability. They drifted once; this makes drift fail loudly.
    const fromSetup = new Set(SETUP_LANGUAGES.map((n) => resolveLanguage(n)));
    const fromWorkspace = new Set(LANGUAGE_OPTIONS.map((o) => resolveLanguage(o.value)));
    expect([...fromWorkspace].sort()).toEqual([...fromSetup].sort());
  });

  it("every language the Setup editor offers resolves to a DISTINCT supported code", () => {
    const resolved = SETUP_LANGUAGES.map((name) => [name, resolveLanguage(name)] as const);

    // No option may collapse onto another's code — that is precisely how "French" silently
    // became an English-speaking employee.
    const codes = resolved.map(([, code]) => code);
    expect(new Set(codes).size).toBe(SETUP_LANGUAGES.length);

    // And each option must produce a real voice + transcriber for its own code.
    for (const [name, code] of resolved) {
      expect(resolveVoice(name).voiceId, `${name} must have its own voice`).toBe(
        resolveVoice(code).voiceId
      );
      expect(resolveTranscriber(name).language, `${name} must transcribe as ${code}`).toBe(code);
    }
  });
});
