"use server";

import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { draftKnowledgeForOrg, type KnowledgeDraft } from "@/lib/platform/knowledgeDraft";

/**
 * Draft the Knowledge fields for the signed-in workspace.
 *
 * Deliberately returns the draft instead of saving it. What goes in Knowledge is spoken to
 * customers as the business's own word, so a machine may propose it and only a person may commit
 * it — the review step is the safety mechanism, not a formality.
 */
export async function draftKnowledgeAction(): Promise<
  { ok: true; draft: KnowledgeDraft; usedQuestions: number } | { ok: false; error: string }
> {
  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    return { ok: false, error: "Please sign in again." };
  }
  if (!orgId) return { ok: false, error: "No workspace found." };

  return draftKnowledgeForOrg(orgId);
}
