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
  "For `faqs`, use only questions customers actually asked, and only give an answer where the",
  "material states it. If you know the question but not the answer, write the question followed",
  'by " — " and nothing else, so the owner can see what to fill in.',
  "",
  "Write in the same language the business used to describe itself.",
  "",
  'Return JSON with exactly these keys, all strings, empty string where unknown: "businessName",',
  '"services", "openingHours", "serviceArea", "faqs", "bookingPolicy", "cancellationPolicy", "tone".',
].join("\n");

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
          .select("business_description, onboarding_goal, onboarding_language")
          .eq("org_id", orgId)
          .maybeSingle<{
            business_description: string | null;
            onboarding_goal: string | null;
            onboarding_language: string | null;
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
    const existing = (agent?.business_context ?? {}) as Record<string, unknown>;
    const existingServices = str(existing.services);

    // Nothing to work from. Drafting out of thin air is precisely what must not happen.
    if (!description && !existingServices) {
      return {
        ok: false,
        error:
          "There is nothing to draft from yet. Write a sentence about what your business does, then try again.",
      };
    }

    const questions = (inbound ?? [])
      .map((m) => str((m as { content?: unknown }).content))
      .filter((q) => q.length > 2 && q.length < 300)
      .slice(0, 25);

    const material = [
      org?.name ? `Workspace name (may be an internal label, not the customer-facing name): ${org.name}` : "",
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
