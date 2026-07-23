import "server-only";
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
] as const;

// R-052 — per-assistant call caps (owner-decided). Applied on EVERY config path so no
// line can run away on cost. 15-min hard cap; hang up after 30s of silence.
export const CALL_MAX_DURATION_SECONDS = 900;
export const CALL_SILENCE_TIMEOUT_SECONDS = 30;

// R-051 — voice + transcriber are now actually sent to Vapi (were `none`). Launch
// languages: English + Spanish. Voices use OpenAI TTS (language-agnostic) via Vapi;
// language drives the Deepgram transcriber. Per-agent voice PICKING is R-038 (later);
// here we send a real, language-appropriate default that agent settings can override.
export type SupportedLanguage = "en" | "es";

const DEFAULT_VOICE_BY_LANGUAGE: Record<SupportedLanguage, { provider: string; voiceId: string }> = {
  en: { provider: "openai", voiceId: "alloy" },
  es: { provider: "openai", voiceId: "nova" },
};

/** Normalize any stored language string to a supported code (default en). Pure. */
export function resolveLanguage(language?: string | null): SupportedLanguage {
  return (language ?? "").toLowerCase().startsWith("es") ? "es" : "en";
}

/** Vapi `voice` object from language + optional explicit voiceId. Pure. */
export function resolveVoice(language?: string | null, voiceId?: string | null): { provider: string; voiceId: string } {
  const base = DEFAULT_VOICE_BY_LANGUAGE[resolveLanguage(language)];
  const id = (voiceId ?? "").trim();
  return id ? { provider: base.provider, voiceId: id } : base;
}

/** Vapi `transcriber` object (Deepgram) for the language. Pure. */
export function resolveTranscriber(language?: string | null): { provider: string; model: string; language: SupportedLanguage } {
  return { provider: "deepgram", model: "nova-2", language: resolveLanguage(language) };
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
  input: Pick<AssistantConfigInput, "systemPrompt" | "firstMessage" | "language" | "voiceId">,
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
  patch.voice = resolveVoice(input.language, input.voiceId);
  patch.transcriber = resolveTranscriber(input.language);

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
