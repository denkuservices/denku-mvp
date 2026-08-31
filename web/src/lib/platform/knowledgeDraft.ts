import "server-only";

import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveLlmProvider } from "@/lib/llm/provider";

/**
 * Draft the Knowledge fields from what the workspace already told us.
 *
 * **The whole design turns on one rule: this may not invent facts.**
 *
 * Everything written into Knowledge is spoken to customers as though the business had said it.
 * A drafted "Mon–Fri 9–6" that nobody corrected becomes an AI confidently giving out opening
 * hours the business never had — and it would be believed, because it arrived through the
 * business's own channel. That is a worse failure than an empty field, which merely produces
 * "I'll pass that to the team".
 *
 * So the model is given exactly two jobs: REPHRASE what the owner already wrote into the right
 * field, and leave everything else EMPTY. It is explicitly forbidden from filling a field it was
 * not told about. `tone` is the one exception it may infer, because a tone is a manner of
 * speaking rather than a claim about the world — being wrong about it is a style mismatch the
 * owner will notice on the first reply, not a false fact told to a customer.
 *
 * The result is a DRAFT. It is returned to the form for the owner to read and edit; nothing is
 * saved until they press save. That is not a formality — it is the correction step the whole
 * design depends on.
 */

export type KnowledgeDraft = {
  businessName: string;
  services: string;
  openingHours: string;
  serviceArea: string;
  faqs: string;
  bookingPolicy: string;
  cancellationPolicy: string;
  tone: string;
};

export type DraftResult =
  | { ok: true; draft: KnowledgeDraft; usedQuestions: number }
  | { ok: false; error: string };

const EMPTY_DRAFT: KnowledgeDraft = {
  businessName: "",
  services: "",
  openingHours: "",
  serviceArea: "",
  faqs: "",
  bookingPolicy: "",
  cancellationPolicy: "",
  tone: "",
};

const LLM_TIMEOUT_MS = 20_000;

const SYSTEM_PROMPT = [
  "You prepare a draft profile for a small business, to be reviewed by its owner before use.",
  "",
  "You will be given: the business's own description of itself, its name, what it uses its AI for,",
  "and real questions its customers have asked. Reorganise that material into the fields below.",
  "",
  "ABSOLUTE RULE — you may not invent facts.",
  "- Only write something in a field if the material you were given actually says it.",
  "- If you were not told the opening hours, leave openingHours EMPTY. Never guess a time.",
  "- The same for prices, locations, policies, notice periods and fees: not stated means empty.",
  "- Do not infer from the industry. 'A dental clinic' does not tell you when it opens.",
  "- An empty field is a correct answer. A plausible invention is not.",
  "",
  "The one exception is `tone`: you may suggest a manner of speaking that suits this business,",
  "because that is a style choice the owner will recognise, not a claim about the world.",
  "",
  "For `faqs`, write four to six question-and-answer pairs, one per line, as `Question — Answer`.",
  "- Start from real customer questions if you were given any. Ignore greetings, one-word",
  "  messages and bot commands like /start — those are not questions.",
  "- If there are few or none, PROPOSE the questions this kind of business is usually asked.",
  "  Proposing a question is safe: a question is a prompt for the owner, not a claim about them.",
  "- Answers are NOT safe to invent. Answer only where the material you were given says so.",
  '- Where you know the question but not the answer, write `Question — ` and stop, so the owner',
  "  sees exactly what is left to fill in.",
  "",
  "Write in the same language the business used to describe itself.",
  "",
  'Return JSON with exactly these keys, all strings, empty string where unknown: "businessName",',
  '"services", "openingHours", "serviceArea", "faqs", "bookingPolicy", "cancellationPolicy", "tone".',
].join("\n");

/**
 * Bot commands and bare greetings, in the languages this product actually meets.
 *
 * The first version fed every inbound message to the model as "a real question customers asked",
 * so a fresh Telegram bot whose entire history was "/start" and "merhaba" produced an FAQ section
 * reading "/start —" and "merhaba —". Those are not questions; they are the noise every chat
 * channel opens with.
 */
const GREETINGS = new Set([
  "merhaba", "selam", "selamlar", "günaydın", "iyi günler", "iyi akşamlar", "sa", "slm",
  "hi", "hii", "hey", "hello", "helo", "yo", "good morning", "good evening", "good afternoon",
  "hola", "buenas", "buenos días", "hallo", "guten tag", "bonjour", "salut",
  "test", "deneme", "ok", "okay", "tamam", "teşekkürler", "teşekkür ederim", "thanks", "thank you",
]);

/** Words that make a sentence a question even with no question mark. */
const QUESTION_WORDS = new Set([
  "mi", "mı", "mu", "mü", "misin", "mısın", "musun", "müsün", "miyim", "mıyım", "miyiz",
  "ne", "neden", "nasıl", "kaç", "nerede", "nereye", "nereden", "kim", "hangi", "ücret", "fiyat",
  "what", "when", "where", "how", "why", "which", "who", "can", "do", "does", "is", "are", "price",
  "qué", "cuándo", "dónde", "cómo", "cuánto", "precio",
]);

/** Whether an inbound message is plausibly a question worth putting in an FAQ. */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Telegram and Slack style commands are addressed to the software, not to the business.
  if (t.startsWith("/")) return false;

  const normalized = t.toLowerCase().replace(/[!.,…]+$/g, "").trim();
  if (GREETINGS.has(normalized)) return false;

  // A question mark is the strongest signal in every language here.
  if (t.includes("?")) return true;

  /*
   * Turkish asks plenty of questions without one ("fiyat ne kadar", "randevu alabilir miyim").
   *
   * Matched as whole WORDS by splitting, rather than with a word-boundary regex: JavaScript's
   * word boundary is ASCII and mishandles the very letters this has to read, while a plain
   * substring match would find "ne" inside half the language — putting the noise straight back
   * into the FAQ this filter exists to keep out.
   */
  const words = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.some((w) => QUESTION_WORDS.has(w))) return true;

  // Otherwise only treat it as a question if there is enough of it to be one.
  return t.length >= 25;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, 2000) : "";
}

/**
 * Gather what the workspace has already said about itself, and draft from it.
 *
 * Returns a clear reason rather than throwing: this sits behind an optional button, and the
 * form must be able to say why nothing happened.
 */
export async function draftKnowledgeForOrg(orgId: string): Promise<DraftResult> {
  if (!orgId) return { ok: false, error: "No workspace." };

  const provider = resolveLlmProvider();
  if (!provider) {
    return { ok: false, error: "AI drafting is not configured on this deployment." };
  }

  try {
    const [{ data: org }, { data: settings }, { data: agent }, { data: inbound }] =
      await Promise.all([
        supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
        supabaseAdmin
          .from("organization_settings")
          .select("business_description, onboarding_goal, onboarding_language, website_url, website_facts")
          .eq("org_id", orgId)
          .maybeSingle<{
            business_description: string | null;
            onboarding_goal: string | null;
            onboarding_language: string | null;
            website_url: string | null;
            website_facts: Record<string, unknown> | null;
          }>(),
        supabaseAdmin
          .from("agents")
          .select("business_context")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle<{ business_context: Record<string, unknown> | null }>(),
        // What customers actually asked. The single most useful input here, and the one thing
        // the owner cannot easily reconstruct from memory.
        supabaseAdmin
          .from("messages")
          .select("content, conversations!inner(org_id)")
          .eq("conversations.org_id", orgId)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

    const description = str(settings?.business_description);
    const site = (settings?.website_facts ?? null) as Record<string, unknown> | null;
    const siteLines = site
      ? Object.entries(site)
          .map(([k, v]) => (str(v) ? `${k}: ${str(v)}` : ""))
          .filter(Boolean)
      : [];
    const existing = (agent?.business_context ?? {}) as Record<string, unknown>;
    const existingServices = str(existing.services);

    // Nothing to work from. Drafting out of thin air is precisely what must not happen.
    if (!description && !existingServices && siteLines.length === 0) {
      return {
        ok: false,
        error:
          "There is nothing to draft from yet. Write a sentence about what your business does, then try again.",
      };
    }

    const questions = (inbound ?? [])
      .map((m) => str((m as { content?: unknown }).content))
      .filter((q) => q.length < 300 && looksLikeQuestion(q))
      .slice(0, 25);

    const material = [
      org?.name ? `Workspace name (may be an internal label, not the customer-facing name): ${org.name}` : "",
      // Read from the business's own site. Still material to rephrase, not licence to embellish:
      // a real page can be years out of date, and "we read it off your website" is no defence for
      // telling a customer the wrong opening time.
      siteLines.length
        ? `Read from the business's own website${
            settings?.website_url ? ` (${settings.website_url})` : ""
          }:\n${siteLines.join("\n")}`
        : "",
      description ? `The business describes itself as: ${description}` : "",
      existingServices ? `Services already recorded: ${existingServices}` : "",
      settings?.onboarding_goal ? `It uses its AI mainly for: ${settings.onboarding_goal}` : "",
      questions.length
        ? `Real questions customers have asked:\n${questions.map((q) => `- ${q}`).join("\n")}`
        : "No customer questions recorded yet.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      maxRetries: 0,
      timeout: LLM_TIMEOUT_MS,
    });

    const call = client.chat.completions.create({
      model: provider.model,
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: material },
      ],
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("knowledge_draft_timeout")), LLM_TIMEOUT_MS + 500)
    );

    const completion = await Promise.race([call, timeout]);
    const raw = completion.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const draft: KnowledgeDraft = {
      businessName: str(parsed.businessName),
      services: str(parsed.services),
      openingHours: str(parsed.openingHours),
      serviceArea: str(parsed.serviceArea),
      faqs: str(parsed.faqs),
      bookingPolicy: str(parsed.bookingPolicy),
      cancellationPolicy: str(parsed.cancellationPolicy),
      tone: str(parsed.tone),
    };

    // A model that returned nothing usable is a failure to report, not an empty form to hand back.
    const anything = Object.values(draft).some((v) => v.length > 0);
    if (!anything) {
      return { ok: false, error: "The draft came back empty. Try again, or fill it in yourself." };
    }

    console.info("[KNOWLEDGE_DRAFT][OK]", {
      org_id: orgId,
      questions: questions.length,
      filled: Object.values(draft).filter((v) => v.length > 0).length,
    });

    return { ok: true, draft, usedQuestions: questions.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[KNOWLEDGE_DRAFT][FAILED]", { org_id: orgId, error: message });
    return { ok: false, error: "Could not draft this right now. Please try again." };
  }
}

export { EMPTY_DRAFT };
