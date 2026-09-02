"use server";

import { hasAnyPaidPlan } from "@/lib/billing/planState";

/**
 * Is this workspace in preview mode — that is, has it bought nothing?
 *
 * **The rule changed on 2026-09-02 and the change is the point.** It used to be
 * `org_plan_limits.plan_code IS NULL`, which asked "does this workspace have a VOICE plan" and
 * answered as though that were the only thing on sale. A customer who bought chat and no phone
 * line would have been read as unpaid and gated out of what they were paying for — which is
 * exactly why the fake `chat_only` voice plan had to exist.
 *
 * Now it asks the question it always meant: has this workspace bought anything, voice or chat.
 * See `lib/billing/planState.ts` for the two products and why neither gates the other.
 *
 * Preview mode still means the same thing to the rest of the app: gate destructive and paid
 * features, and show a way to buy.
 */
export async function isPreviewMode(orgId: string): Promise<boolean> {
  return !(await hasAnyPaidPlan(orgId));
}
