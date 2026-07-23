import "server-only";

import OpenAI from "openai";

/**
 * R-019 — call intent classification on the FINAL transcript.
 *
 * AI-primary: OpenAI `gpt-4o-mini` returns structured JSON
 * `{ intent, confidence, booking_details }`. Regex is a conservative FALLBACK only
 * (no transcript, no key, low confidence, or any LLM error/timeout). Strict timeout +
 * graceful degradation. **Never throws** — the webhook must never fail because of this.
 */

export type CallIntent = "support" | "appointment" | "other";

export interface BookingDetails {
  name?: string | null;
  service?: string | null;
  preferredTime?: string | null;
}

export interface IntentResult {
  intent: CallIntent;
  confidence: number; // 0..1
  source: "llm" | "regex" | "none";
  bookingDetails?: BookingDetails | null;
}

const LLM_TIMEOUT_MS = 8000;
const LLM_MIN_CONFIDENCE = 0.5;
const VALID_INTENTS: CallIntent[] = ["support", "appointment", "other"];

/** Conservative regex fallback (pure). Booking keywords → appointment, else support. */
export function classifyIntentRegex(transcript: string | null | undefined): IntentResult {
  const t = (transcript ?? "").toLowerCase();
  if (!t.trim()) return { intent: "other", confidence: 0, source: "none" };
  const booking =
    /\b(book|booking|appointment|schedule|scheduling|reschedul|availab|reserve|reservation|slot|come in|set up a time|make an appointment)\b/.test(
      t
    );
  if (booking) return { intent: "appointment", confidence: 0.6, source: "regex" };
  return { intent: "support", confidence: 0.5, source: "regex" };
}

const SYSTEM_PROMPT =
  "You classify the caller's PRIMARY intent from a phone-call transcript for a small business. " +
  'Respond with ONLY a JSON object: {"intent": "appointment" | "support" | "other", "confidence": <0..1>, ' +
  '"booking_details": {"name": string|null, "service": string|null, "preferred_time": string|null}}. ' +
  'Use "appointment" when the caller wants to book, schedule, reschedule, or cancel an appointment, or asks about availability. ' +
  'Use "support" for questions, problems, or requests that are not booking. Use "other" only when unclear. ' +
  "Extract booking_details only for appointment intent; otherwise use nulls.";

/** LLM classification. Returns null on any failure/timeout so the caller falls back. */
async function classifyIntentLlm(transcript: string): Promise<IntentResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey, maxRetries: 0, timeout: LLM_TIMEOUT_MS });

  const call = client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    max_tokens: 200,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Transcript:\n${transcript.slice(0, 6000)}` },
    ],
  });

  // Hard timeout guarantee on top of the SDK timeout.
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("intent_llm_timeout")), LLM_TIMEOUT_MS + 500)
  );

  try {
    const completion = await Promise.race([call, timeout]);
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as {
      intent?: string;
      confidence?: number;
      booking_details?: { name?: unknown; service?: unknown; preferred_time?: unknown } | null;
    };

    const intent = VALID_INTENTS.includes(parsed.intent as CallIntent) ? (parsed.intent as CallIntent) : "other";
    const confidence =
      typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

    const bd = parsed.booking_details;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const bookingDetails: BookingDetails | null =
      intent === "appointment" && bd
        ? { name: str(bd.name), service: str(bd.service), preferredTime: str(bd.preferred_time) }
        : null;

    return { intent, confidence, source: "llm", bookingDetails };
  } catch {
    return null; // timeout, network, bad JSON, etc. → fall back
  }
}

/**
 * Classify a call's intent from its final transcript. AI-primary, regex fallback,
 * never throws.
 */
export async function classifyCallIntent(transcript: string | null | undefined): Promise<IntentResult> {
  try {
    const t = (transcript ?? "").trim();
    if (!t) return { intent: "other", confidence: 0, source: "none" };

    const llm = await classifyIntentLlm(t);
    if (llm && llm.confidence >= LLM_MIN_CONFIDENCE) return llm;

    // No key / low confidence / error → conservative regex.
    return classifyIntentRegex(t);
  } catch {
    return classifyIntentRegex(transcript);
  }
}
