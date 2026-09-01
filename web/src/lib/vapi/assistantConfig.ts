import "server-only";

import {
  LANGUAGES,
  MULTILINGUAL_TRANSCRIBER_MODEL,
  MULTILINGUAL_VOICE,
  resolveLanguageSet,
  toLanguageCode,
  type LanguageCode,
} from "@/lib/language/registry";
import { vapiFetch } from "./server";

/**
 * Shared assistant-config assembly (R-050 + R-077).
 *
 * ONE place that assembles the Vapi assistant PATCH so every path — onboarding
 * activation, phone-line purchase, and Settings agent sync — attaches the tools and
 * points the webhook at the right place. The rule this enforces:
 *
 *   1. GET the current assistant, MERGE `model.toolIds` (never replace) so the
 *      create_ticket / create_appointment tools are always present. This is what
 *      `syncAgentToVapi` used to wipe (R-050b) and the purchase path never set (R-050a).
 *   2. Set `server.url` to the CANONICAL webhook URL from EXPLICIT env — never the
 *      request/creation-environment base (which froze `http://localhost:3000/api/tools`
 *      into live assistants — R-077).
 *   3. When a webhook secret is configured, send it as the `x-vapi-secret` header so
 *      Task 5's staged webhook auth can enforce (this is the header Vapi's demo
 *      assistant already uses).
 *
 * The deterministic post-call artifact fallback is the safety net and is untouched.
 */

/** create_ticket + create_appointment. Hardcoded in the Vapi account (env-coupled). */
export const DENKU_TOOL_IDS = [
  "6c9b0279-dd71-4511-827f-a3e75b884773", // create_ticket
  "5373add8-b7d2-49f0-a866-f60167a1e624", // create_appointment
  // identify_caller (R-139). Its DESCRIPTION in the Vapi account is a security control, not
  // documentation: it is what makes the assistant ask "Who am I speaking with?" instead of
  // "Am I speaking with Jack?", which would name the customer to whoever picked up. Change the
  // two together — contract at the top of app/api/tools/identify-caller/route.ts.
  "f7dba1e6-3e3b-4b22-9dfa-48708a39bc12", // identify_caller
] as const;

// R-052 — per-assistant call caps (owner-decided). Applied on EVERY config path so no
// line can run away on cost. 15-min hard cap; hang up after 30s of silence.
export const CALL_MAX_DURATION_SECONDS = 900;
export const CALL_SILENCE_TIMEOUT_SECONDS = 30;

// R-051 — voice + transcriber are now actually sent to Vapi (were `none`).
//
// 2026-08-28: the per-language voice/transcriber tables that lived here moved to
// `lib/language/registry.ts`, which is now the single description of what Denku can hear and
// speak. The pickers derive from it too, so a language cannot appear in a dropdown without an ear
// and a mouth behind it (R-135). These functions stay as the Vapi-shaped view of that registry.
export type SupportedLanguage = LanguageCode;

type VoiceConfig = {
  provider: string;
  voiceId: string;
  /** TTS model, where the provider has one that decides which languages are intelligible. */
  model?: string;
  version?: number;
  language?: string;
};

/**
 * Normalize any stored language string to a supported code. Pure.
 *
 * Unknown values fall back to `en` deliberately: an unrecognised value must resolve to something
 * speakable rather than break the call. The Setup editor persists the language NAME ("Spanish")
 * while onboarding persists the ISO CODE ("es") — both resolve, which is the R-135 fix.
 */
export function resolveLanguage(language?: string | null): SupportedLanguage {
  return toLanguageCode(language) ?? "en";
}

/** Vapi `voice` object from language + optional explicit voiceId. Pure. */
export function resolveVoice(language?: string | null, voiceId?: string | null): VoiceConfig {
  const base = LANGUAGES[resolveLanguage(language)].voice;
  const id = (voiceId ?? "").trim();
  return id ? { ...base, voiceId: id } : base;
}

/** Vapi `transcriber` object (Deepgram) for the language. Pure. */
export function resolveTranscriber(language?: string | null): { provider: string; model: string; language: SupportedLanguage } {
  const lang = resolveLanguage(language);
  return { provider: "deepgram", model: LANGUAGES[lang].transcriberModel, language: lang };
}

/**
 * The ear, told what to expect (2026-08-28).
 *
 * Deepgram is the only part of the chain that needs to be told a language at all. The brain
 * already knows every language, and the mouth follows whatever the brain answered in. So the
 * whole of multilingual support is this one decision:
 *
 *   - **One language** → pin the ear to it. This is the most accurate the transcriber gets, and
 *     it is what every employee does today.
 *   - **More than one** → switch to code-switching, where the ear decides per utterance.
 *
 * There is no separate "multilingual" toggle, deliberately. An owner who adds Spanish has already
 * said everything we needed to know; asking them a second, more technical question would only
 * create a state where the two answers disagree.
 */
export function resolveTranscriberForLanguages(
  codes: readonly LanguageCode[]
): { provider: string; model: string; language: string } {
  const [primary, ...rest] = codes.length ? codes : (["en"] as LanguageCode[]);
  if (rest.length === 0) {
    return { provider: "deepgram", model: LANGUAGES[primary].transcriberModel, language: primary };
  }
  return { provider: "deepgram", model: MULTILINGUAL_TRANSCRIBER_MODEL, language: "multi" };
}

/**
 * The mouth, for however many languages the ear is listening for.
 *
 * A single language keeps its own voice. More than one needs a voice that can follow the caller —
 * the primary's voice if it can, otherwise the designated multilingual one. A voice pinned to
 * Spanish reading an English answer is worse than the problem it was meant to solve.
 */
export function resolveVoiceForLanguages(
  codes: readonly LanguageCode[],
  voiceId?: string | null
): VoiceConfig {
  const [primary, ...rest] = codes.length ? codes : (["en"] as LanguageCode[]);
  const base =
    rest.length === 0 || LANGUAGES[primary].voiceFollowsCaller
      ? LANGUAGES[primary].voice
      : MULTILINGUAL_VOICE;
  const id = (voiceId ?? "").trim();
  return id ? { ...base, voiceId: id } : base;
}

/**
 * Canonical URL Vapi should POST call events to. Explicit env only — never
 * `VERCEL_URL`/localhost (the R-077 root cause). Returns "" when no safe base is
 * configured, so callers skip setting `server` rather than freezing a wrong URL.
 */
export function getVapiWebhookServerUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.VAPI_WEBHOOK_BASE_URL || env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  if (/localhost|127\.0\.0\.1/.test(base)) return ""; // never freeze a dev URL
  return `${base}/api/webhooks/vapi`;
}

export type AssistantConfigInput = {
  assistantId: string;
  /** If provided, replaces the model's system message; otherwise existing messages are kept. */
  systemPrompt?: string | null;
  firstMessage?: string | null;
  /** Agent language (drives transcriber + default voice). Default en. (R-051) */
  language?: string | null;
  /** Explicit voiceId override (R-038 territory); otherwise a language default is used. */
  voiceId?: string | null;
  /**
   * Languages this employee should ALSO understand, beyond `language` (2026-08-28).
   *
   * Empty or absent is the whole of today's product: one language, ear pinned to it. Adding one
   * is what switches the transcriber to code-switching — there is no second toggle.
   */
  additionalLanguages?: readonly string[] | null;
};

/** Shape we read back from `GET /assistant/{id}` (only the parts we merge). */
type CurrentAssistant = {
  model?: { toolIds?: string[]; messages?: unknown; [k: string]: unknown } | null;
} | null;

/**
 * Pure: build the PATCH body from the current assistant + desired config. Unit-tested.
 * Merges toolIds (union), preserves the rest of `model`, and sets the webhook server.
 */
export function buildAssistantConfigPatch(
  current: CurrentAssistant,
  input: Pick<
    AssistantConfigInput,
    "systemPrompt" | "firstMessage" | "language" | "voiceId" | "additionalLanguages"
  >,
  env: NodeJS.ProcessEnv = process.env
): Record<string, unknown> {
  const existingModel = (current?.model ?? { provider: "openai", model: "gpt-4o" }) as Record<string, unknown>;
  const existingToolIds = Array.isArray(existingModel.toolIds) ? (existingModel.toolIds as string[]) : [];
  const toolIds = Array.from(new Set([...existingToolIds, ...DENKU_TOOL_IDS]));

  const model: Record<string, unknown> = { ...existingModel, toolIds };
  if (input.systemPrompt) {
    model.messages = [{ role: "system", content: input.systemPrompt }];
  }

  const patch: Record<string, unknown> = { model };
  if (input.firstMessage) patch.firstMessage = input.firstMessage;

  // R-051: real voice + transcriber (language) — no longer `none`.
  // 2026-08-28: driven by the employee's whole language set, which for every existing employee is
  // exactly one language and therefore resolves to exactly what it did before.
  const languages = resolveLanguageSet(input.language, input.additionalLanguages);
  patch.voice = resolveVoiceForLanguages(languages, input.voiceId);
  patch.transcriber = resolveTranscriberForLanguages(languages);

  // R-052: universal call caps on every path.
  patch.maxDurationSeconds = CALL_MAX_DURATION_SECONDS;
  patch.silenceTimeoutSeconds = CALL_SILENCE_TIMEOUT_SECONDS;

  const serverUrl = getVapiWebhookServerUrl(env);
  if (serverUrl) {
    const secret = (env.VAPI_WEBHOOK_SECRET ?? "").trim();
    patch.server = secret
      ? { url: serverUrl, headers: { "x-vapi-secret": secret } }
      : { url: serverUrl };
  }
  return patch;
}

/**
 * I/O: GET the assistant, assemble the merged PATCH, and apply it. Idempotent and
 * never throws — returns `{ ok, error }` so creation paths can treat failure as
 * non-fatal (the deterministic fallback still produces artifacts) while the sync path
 * can surface it.
 */
export async function ensureAssistantConfig(
  input: AssistantConfigInput
): Promise<{ ok: boolean; error?: string }> {
  try {
    const current = await vapiFetch<CurrentAssistant>(`/assistant/${input.assistantId}`, { method: "GET" });
    const patch = buildAssistantConfigPatch(current, {
      systemPrompt: input.systemPrompt,
      firstMessage: input.firstMessage,
      language: input.language,
      voiceId: input.voiceId,
      additionalLanguages: input.additionalLanguages,
    });
    await vapiFetch(`/assistant/${input.assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("[VAPI][ASSISTANT_CONFIG][FAILED]", { assistantId: input.assistantId, error });
    return { ok: false, error };
  }
}
