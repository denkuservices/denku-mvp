/**
 * Which LLM answers, and through which door.
 *
 * Denku calls a model in exactly one place today — classifying a finished call's intent
 * (`lib/intent/classifyCallIntent.ts`) — and will call one in a second place soon: replying on the
 * chat channels. Both want the same thing: a small, cheap, fast model that returns JSON. Neither
 * wants to care whose model it is.
 *
 * So the provider is chosen from the environment rather than hard-coded, and **Gemini is reached
 * through its OpenAI-compatible endpoint** rather than a second SDK. That is the whole trick: one
 * client library, one code path, one set of types, and switching providers is an env var rather
 * than a refactor.
 *
 * Resolution order — the first key present wins:
 *   1. `GEMINI_API_KEY`  → Google AI Studio, `gemini-3.5-flash-lite` by default
 *   2. `OPENAI_API_KEY`  → OpenAI, `gpt-4o-mini` by default
 *   3. nothing           → `null`, and every caller falls back to its deterministic path
 *
 * `LLM_MODEL` overrides the model for whichever provider is active, so a model rename never needs
 * a deploy — just an env change.
 *
 * ⚠️ **The transcripts we send are customer personal data.** On Google AI Studio's *free* tier,
 * Google may use submitted data to improve its products; only a billing-enabled (paid) project is
 * excluded from that. Use a paid key in production, and keep the free one for our own test calls.
 *
 * ⚠️ Note this is NOT the model the caller talks to. The voice conversation runs on Vapi's own
 * assistant (`model.model`, currently gpt-4o, billed by Vapi) — changing this file does not change
 * that, and changing that is a separate decision in `lib/vapi/assistantConfig.ts`.
 */

export type LlmProviderId = "gemini" | "openai";

export interface LlmProvider {
  id: LlmProviderId;
  apiKey: string;
  /** Passed straight to the OpenAI SDK; undefined means OpenAI's own default. */
  baseURL?: string;
  model: string;
}

const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

/**
 * Cheapest model of each family that reliably returns structured JSON.
 *
 * Verified against the live API on 2026-08-27: `gemini-2.5-flash-lite` now answers
 * *"no longer available to new users — use models/gemini-3.5-flash-lite"*, so a new key cannot
 * reach it at all. This is exactly why `LLM_MODEL` exists: the next rename is an env change on a
 * running deployment, not a code release.
 */
const DEFAULT_MODEL: Record<LlmProviderId, string> = {
  gemini: "gemini-3.5-flash-lite",
  openai: "gpt-4o-mini",
};

type Env = Record<string, string | undefined>;

/**
 * The active provider, or null when no key is configured.
 *
 * Pure and env-injectable so the resolution rule is testable without touching `process.env`.
 */
export function resolveLlmProvider(env: Env = process.env): LlmProvider | null {
  const model = (env.LLM_MODEL ?? "").trim();

  const gemini = (env.GEMINI_API_KEY ?? "").trim();
  if (gemini) {
    return {
      id: "gemini",
      apiKey: gemini,
      baseURL: GEMINI_OPENAI_BASE_URL,
      model: model || DEFAULT_MODEL.gemini,
    };
  }

  const openai = (env.OPENAI_API_KEY ?? "").trim();
  if (openai) {
    return {
      id: "openai",
      apiKey: openai,
      model: model || DEFAULT_MODEL.openai,
    };
  }

  return null;
}

/** Whether any model is reachable at all — for readiness checks and honest logging. */
export function llmConfigured(env: Env = process.env): boolean {
  return resolveLlmProvider(env) !== null;
}
