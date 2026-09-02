import "server-only";
import OpenAI from "openai";
import { resolveLlmProvider } from "@/lib/llm/provider";
import {
  EMPTY_BUSINESS_CONTEXT,
  type BusinessContext,
} from "@/app/(app)/dashboard/_platform/team/setupFields";

/**
 * Reading a business's own document and filling in what it says.
 *
 * **The whole design turns on one rule: a field it cannot evidence is left blank.** Everything
 * here ends up in a system prompt that a real customer hears spoken aloud on a phone call, so an
 * invented opening hour is not a cosmetic error — it is the AI telling someone to turn up on a
 * Sunday to a locked door. Blank is recoverable; wrong is not.
 *
 * That is also why this SUGGESTS rather than saves. The extraction is shown beside the existing
 * Knowledge fields and the owner accepts it, edits it, or throws it away. The reviewing step is
 * not friction to be optimised out later — it is the only thing standing between a PDF nobody
 * proof-read and what the business promises its customers.
 *
 * The document is kept after extraction. Re-running this when the prompt improves costs one API
 * call and no re-upload, and a stored document is what a future retrieval index would be built
 * from if these eight fields ever stop being enough.
 */

const LLM_TIMEOUT_MS = 25_000;

export interface KnowledgeSuggestion {
  /** Only the fields the document actually supports. Everything else stays absent. */
  fields: Partial<BusinessContext>;
  /** Field names the model was asked for and could not find. Shown so the gaps are visible. */
  missing: (keyof BusinessContext)[];
  source: "llm" | "unavailable";
}

const FIELD_GUIDE: Record<keyof BusinessContext, string> = {
  businessName: "the trading name customers know it by",
  services: "what it sells or does, with prices only if the document states them",
  openingHours: "the days and hours staff are there, exactly as written",
  serviceArea: "the places it serves — neighbourhoods, cities, or a radius",
  faqs: "questions customers ask and the answers this document gives",
  bookingPolicy: "how an appointment is made, deposits, notice required",
  cancellationPolicy: "how much notice to cancel, and any fee",
  tone: "how the business talks about itself — formal, warm, brisk",
};

const SYSTEM_PROMPT = `You are reading a document a business uploaded about itself, so its AI receptionist can answer customers accurately.

Return JSON with exactly these keys:
${(Object.keys(FIELD_GUIDE) as (keyof BusinessContext)[])
  .map((k) => `  "${k}": string   // ${FIELD_GUIDE[k]}`)
  .join("\n")}

THE ONE RULE THAT MATTERS: if the document does not state something, return an empty string for it. Do not infer, do not generalise from the industry, do not fill a gap with something plausible. What you write here will be spoken to real customers on the telephone as fact. An empty field is corrected in ten seconds by the owner; an invented opening hour sends someone to a locked door.

Write each field in the SAME LANGUAGE as the document. Keep the business's own wording where it reads naturally — you are transcribing what it says about itself, not rewriting it.

Quote figures, prices and times exactly as the document gives them. Never round, convert, or tidy a number.`;

function coerce(raw: string): KnowledgeSuggestion {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const fields: Partial<BusinessContext> = {};
  const missing: (keyof BusinessContext)[] = [];

  for (const key of Object.keys(EMPTY_BUSINESS_CONTEXT) as (keyof BusinessContext)[]) {
    const value = parsed[key];
    const text = typeof value === "string" ? value.trim() : "";
    if (text) fields[key] = text.slice(0, 4000);
    else missing.push(key);
  }

  return { fields, missing, source: "llm" };
}

/** Nothing was read. Distinct from "read and found nothing", which is a populated `missing`. */
export function unavailableSuggestion(): KnowledgeSuggestion {
  return {
    fields: {},
    missing: Object.keys(EMPTY_BUSINESS_CONTEXT) as (keyof BusinessContext)[],
    source: "unavailable",
  };
}

/**
 * Extract Knowledge fields from a document's text. Never throws.
 */
export async function suggestKnowledgeFromText(text: string): Promise<KnowledgeSuggestion> {
  const body = (text ?? "").trim();
  if (!body) return unavailableSuggestion();

  const provider = resolveLlmProvider();
  if (!provider) return unavailableSuggestion();

  try {
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      maxRetries: 0,
      timeout: LLM_TIMEOUT_MS,
    });

    const call = client.chat.completions.create({
      model: provider.model,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Document:\n\n${body.slice(0, 40_000)}` },
      ],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("knowledge_extract_timeout")), LLM_TIMEOUT_MS + 500)
    );

    const completion = await Promise.race([call, timeout]);
    const raw = completion.choices?.[0]?.message?.content ?? "";
    return coerce(raw);
  } catch {
    return unavailableSuggestion();
  }
}

/**
 * Merge suggestions onto what the owner already has.
 *
 * **A suggestion never overwrites a field someone filled in themselves.** The owner's own words
 * outrank a machine reading of a PDF, always — including when the PDF is newer. Only genuinely
 * empty fields are filled, so uploading a second document adds to the picture instead of
 * rewriting it.
 */
export function applySuggestion(
  current: BusinessContext,
  suggestion: KnowledgeSuggestion
): { merged: BusinessContext; filled: (keyof BusinessContext)[]; skipped: (keyof BusinessContext)[] } {
  const merged = { ...current };
  const filled: (keyof BusinessContext)[] = [];
  const skipped: (keyof BusinessContext)[] = [];

  for (const [key, value] of Object.entries(suggestion.fields) as [keyof BusinessContext, string][]) {
    if (!value?.trim()) continue;
    if (current[key]?.trim()) {
      skipped.push(key);
      continue;
    }
    merged[key] = value;
    filled.push(key);
  }

  return { merged, filled, skipped };
}
