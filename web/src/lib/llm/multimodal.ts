import "server-only";

import OpenAI, { toFile } from "openai";
import { resolveLlmProvider, type LlmProvider } from "@/lib/llm/provider";

/**
 * Seeing and hearing — the provider-specific half of it.
 *
 * `lib/llm/provider.ts` answers "which model, through which door" for TEXT, and it does it by
 * pointing the OpenAI SDK at whoever is configured. Multimodal input does not survive that trick
 * intact, so this module exists to keep the mess in one file:
 *
 * - **Images** go through the OpenAI Chat Completions shape on both providers. Gemini's
 *   OpenAI-compatible endpoint accepts `image_url` with a `data:` URI, so one code path covers
 *   both. This is the part where the compatibility layer genuinely pays off.
 * - **Audio does not.** OpenAI transcribes on a different endpoint entirely
 *   (`/audio/transcriptions`), and Gemini's compatibility layer only takes `input_audio` as wav
 *   or mp3 — which a Telegram voice note (OGG/Opus) is not. So Gemini audio is called on its
 *   NATIVE `generateContent` endpoint with `inline_data`, which accepts ogg, mpeg, wav, m4a and
 *   friends. Two paths, because pretending there is one would mean silently failing on the single
 *   most common voice-note format in the world.
 *
 * Everything here returns `{ ok }` and never throws. A customer who sends a photo must still get
 * an answer when the vision call times out — the caller degrades to "an image we could not read"
 * rather than losing the message.
 *
 * The bytes handed to these functions are customer content: a photo of a damaged product, a voice
 * note with a phone number in it. The warning `provider.ts` carries about free-tier Google AI
 * Studio data use applies here with more force — use a paid key in production.
 */

const VISION_TIMEOUT_MS = 15_000;
const AUDIO_TIMEOUT_MS = 25_000;
const GEMINI_NATIVE_BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface MediaUnderstanding {
  ok: boolean;
  text: string | null;
  /** Never shown to a customer; for logs and for the honest "couldn't read it" path. */
  error?: string;
}

type Env = Record<string, string | undefined>;

/**
 * Which model looks and listens.
 *
 * Defaults to the same model the text path uses, because on Gemini that model already accepts
 * images and audio and a second model would be a second thing to keep alive. `LLM_VISION_MODEL`
 * and `LLM_AUDIO_MODEL` override it, so the next rename is an env change on a running deployment
 * — the rule `provider.ts` established.
 *
 * OpenAI is the exception: transcription is not a chat model at all, so it falls back to
 * `whisper-1` rather than to whatever `LLM_MODEL` happens to be.
 */
export function visionModel(provider: LlmProvider, env: Env = process.env): string {
  return (env.LLM_VISION_MODEL ?? "").trim() || provider.model;
}

export function audioModel(provider: LlmProvider, env: Env = process.env): string {
  const override = (env.LLM_AUDIO_MODEL ?? "").trim();
  if (override) return override;
  return provider.id === "openai" ? "whisper-1" : provider.model;
}

/** The instruction a description is written to. Short, factual, no invention. */
export const IMAGE_PROMPT =
  "You are describing an image a customer just sent to a business, so that a colleague who " +
  "cannot see it can answer them. Describe only what is actually visible: the object or scene, " +
  "its condition, and any text, number, label, price, model or code you can read, quoted exactly. " +
  "If it is a screenshot or a document, transcribe the words that matter. Do not guess what the " +
  "customer wants, do not speculate about brands or causes, and do not add advice. " +
  "Answer in at most 60 words, as plain prose with no preamble.";

/** Same job for a short video: the frames plus anything said in it. */
export const VIDEO_PROMPT =
  "You are describing a short video a customer just sent to a business, so that a colleague who " +
  "cannot watch it can answer them. Say what is shown, in what condition, and transcribe any " +
  "speech or readable text. Only what is actually there, no speculation. At most 60 words.";

/**
 * Transcription instruction for the Gemini path.
 *
 * Deliberately asks for the words and nothing else. Left open, a chat model answers a voice note
 * instead of transcribing it, and the customer's own sentence — the thing the reply engine, the
 * Inbox and the intent classifier all read — would be replaced by the model's opinion of it.
 */
export const AUDIO_PROMPT =
  "Transcribe this audio exactly, in the language actually spoken. Output only the transcript: " +
  "no translation, no summary, no speaker labels, no commentary, no quotation marks. " +
  "If nothing intelligible is said, output nothing at all.";

function client(provider: LlmProvider, timeout: number): OpenAI {
  return new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL, maxRetries: 0, timeout });
}

/** One `generateContent` call against Gemini's native API. Used where the OpenAI shape cannot go. */
async function geminiInline(
  provider: LlmProvider,
  model: string,
  prompt: string,
  mime: string,
  base64: string,
  timeoutMs: number
): Promise<MediaUnderstanding> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GEMINI_NATIVE_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": provider.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: base64 } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 400 },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, text: null, error: `HTTP ${res.status} ${detail.slice(0, 200)}` };
    }

    const payload = (await res.json().catch(() => null)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    } | null;

    const text = (payload?.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();

    return text ? { ok: true, text } : { ok: false, text: null, error: "empty_response" };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, text: null, error: aborted ? "timeout" : err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Describe an image in words a colleague could act on.
 *
 * `hint` is the customer's own caption when they wrote one — it costs nothing to pass and stops
 * the description answering the wrong question about a photo with an obvious subject.
 */
export async function describeImage(input: {
  mime: string;
  base64: string;
  hint?: string | null;
}): Promise<MediaUnderstanding> {
  const provider = resolveLlmProvider();
  if (!provider) return { ok: false, text: null, error: "no_llm_provider" };

  const prompt = input.hint?.trim()
    ? `${IMAGE_PROMPT}\n\nThe customer sent it with this message: "${input.hint.trim().slice(0, 300)}"`
    : IMAGE_PROMPT;

  try {
    const completion = await client(provider, VISION_TIMEOUT_MS).chat.completions.create({
      model: visionModel(provider),
      temperature: 0,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${input.mime};base64,${input.base64}` } },
          ],
        },
      ],
    });

    const text = (completion.choices?.[0]?.message?.content ?? "").trim();
    return text ? { ok: true, text } : { ok: false, text: null, error: "empty_response" };
  } catch (err) {
    return { ok: false, text: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Turn a voice note into the sentence the customer actually said.
 *
 * OpenAI: the dedicated transcription endpoint, which takes OGG/Opus, m4a, mp3 and webm as they
 * arrive — no conversion, which matters because there is no ffmpeg in a serverless function.
 * Gemini: native `inline_data`, for the same reason.
 */
export async function transcribeAudio(input: {
  mime: string;
  base64: string;
  filename?: string | null;
}): Promise<MediaUnderstanding> {
  const provider = resolveLlmProvider();
  if (!provider) return { ok: false, text: null, error: "no_llm_provider" };

  if (provider.id === "openai") {
    try {
      const bytes = Buffer.from(input.base64, "base64");
      const file = await toFile(bytes, input.filename || `voice.${extensionFor(input.mime)}`, {
        type: input.mime,
      });
      const result = await client(provider, AUDIO_TIMEOUT_MS).audio.transcriptions.create({
        file,
        model: audioModel(provider),
      });
      const text = (result.text ?? "").trim();
      return text ? { ok: true, text } : { ok: false, text: null, error: "empty_response" };
    } catch (err) {
      return { ok: false, text: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return geminiInline(provider, audioModel(provider), AUDIO_PROMPT, input.mime, input.base64, AUDIO_TIMEOUT_MS);
}

/**
 * Describe a short video — Gemini only, and honestly so.
 *
 * Gemini takes video inline; OpenAI's chat models do not, and faking it would mean pulling frames
 * out of an mp4 with no ffmpeg. So on OpenAI this returns `unsupported` and the caller records the
 * video without pretending to have watched it. Telegram's round `video_note` is the case that
 * makes this worth having at all.
 */
export async function describeVideo(input: { mime: string; base64: string }): Promise<MediaUnderstanding> {
  const provider = resolveLlmProvider();
  if (!provider) return { ok: false, text: null, error: "no_llm_provider" };
  if (provider.id !== "gemini") return { ok: false, text: null, error: "unsupported_by_provider" };
  return geminiInline(provider, visionModel(provider), VIDEO_PROMPT, input.mime, input.base64, AUDIO_TIMEOUT_MS);
}

/** Filename extension for a mime type — only used to name the blob the API is handed. */
export function extensionFor(mime: string): string {
  const known: Record<string, string> = {
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/mp4": "m4a",
    "audio/x-m4a": "m4a",
    "audio/aac": "aac",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/heic": "heic",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "application/pdf": "pdf",
  };
  return known[mime.toLowerCase()] ?? "bin";
}
