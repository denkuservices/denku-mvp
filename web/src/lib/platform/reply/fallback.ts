import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { executeCreateTicket, type ToolContext } from "@/lib/platform/reply/tools";
import type { ReplyArtifact, ReplyEmployee } from "@/lib/platform/reply/types";

/**
 * What to do when the model cannot answer at all.
 *
 * This exists because of a real conversation: a customer wrote, the model call timed out, and
 * the AI said **nothing**. They had to ask again two minutes later. The rule that produced that
 * silence — "no reply is more honest than a canned one" — is right for the case it was written
 * for (no model configured: nobody is home, and pretending otherwise is a lie). It is wrong for a
 * transient failure, where we are alive, we have the customer's message, and we simply dropped it.
 *
 * Voice has never had this problem: a call that goes wrong still produces an artifact, because
 * "never dead-end" is enforced at the end of every call. A chat has no end, so the guarantee has
 * to attach somewhere else — and the honest place is here, at the moment we know we failed.
 *
 * So the fallback is not an apology. **It creates the ticket first**, which means a person really
 * will follow up and the owner really is emailed, and only then says so. The sentence is true
 * because the work behind it happened, which is the same standard the prompt holds the model to.
 */

/** Failures where the customer is owed a human, rather than silence. */
const RESCUABLE = new Set(["llm_error", "empty_completion"]);

export function shouldRescue(reason: string | undefined): boolean {
  return Boolean(reason && RESCUABLE.has(reason));
}

/**
 * The apology, in the business's own language.
 *
 * Deliberately not translated by the model — the model is what just failed. The business's
 * configured language is the best answer available: it is the language the owner chose for their
 * AI, and it is knowable without a working provider. A customer writing in a third language gets
 * a sentence they may need to translate, which is a poor outcome and still a far better one than
 * no reply at all. (If this becomes common, the fix is a per-employee fallback line in settings,
 * not a model call on the failure path.)
 */
const FALLBACK_TEXT: Record<string, string> = {
  en: "Sorry — I couldn't process that just now. I've passed it to our team and someone will get back to you.",
  es: "Lo siento, no he podido procesar eso ahora. Se lo he pasado a nuestro equipo y alguien te responderá.",
};

export function fallbackText(employee: ReplyEmployee): string {
  const lang = (employee.language ?? "en").trim().toLowerCase().slice(0, 2);
  return FALLBACK_TEXT[lang] ?? FALLBACK_TEXT.en;
}

export interface RescueResult {
  text: string | null;
  artifacts: ReplyArtifact[];
}

/**
 * Turn a failed reply into a real handover. Never throws — this is already the failure path.
 */
export async function rescueFailedReply(params: {
  orgId: string;
  conversationId: string;
  contactId: string | null;
  employee: ReplyEmployee;
  /** What the customer said — the ticket is worthless without it. */
  incoming: string;
  db: SupabaseClient;
}): Promise<RescueResult> {
  const ctx: ToolContext = {
    orgId: params.orgId,
    conversationId: params.conversationId,
    contactId: params.contactId,
    employee: params.employee,
    db: params.db,
  };

  try {
    const outcome = await executeCreateTicket(
      {
        subject: "Message the AI could not answer",
        // The customer's own words, not a summary: a summary written by the failure path is a
        // guess, and the person picking this up needs what was actually said.
        description: `The AI could not respond to this message and it needs a human:\n\n"${params.incoming}"`,
      },
      ctx
    );

    if (!outcome.ok || !outcome.artifact) {
      // Both the model AND the database failed. Saying "someone will follow up" now would be the
      // exact lie the prompt forbids the model to tell, so we say nothing and the log carries it.
      console.error("[REPLY][RESCUE][FAILED]", {
        org_id: params.orgId,
        conversation_id: params.conversationId,
      });
      return { text: null, artifacts: [] };
    }

    console.info("[REPLY][RESCUE][TICKET]", {
      org_id: params.orgId,
      conversation_id: params.conversationId,
      ticket_id: outcome.artifact.id,
    });

    return { text: fallbackText(params.employee), artifacts: [outcome.artifact] };
  } catch (err) {
    console.error("[REPLY][RESCUE][ERROR]", err instanceof Error ? err.message : String(err));
    return { text: null, artifacts: [] };
  }
}
