"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { ensureDefaultOrgForUser } from "@/lib/org/ensureDefaultOrg";
import { sendWelcomeEmail } from "@/lib/email/send";

export type WelcomeStage =
  | "no_session"
  | "no_org"
  | "no_row"
  | "already_sent"
  | "sent"
  | "db_error"
  | "resend_error";

export type SendWelcomeResult = {
  ok: boolean;
  stage: WelcomeStage;
  detail?: unknown;
};

/**
 * Send "Welcome to Denku" email exactly once when onboarding starts (after verified login).
 * Idempotent: uses conditional UPDATE on organization_settings (welcome_email_sent_at) as the lock.
 * If user has no org yet, ensures default org is created first so orgId is never null.
 *
 * Every failure path returns a typed `stage`, which is the intended observability surface
 * for this action — the caller decides what to surface. (R-133 removed a set of unconditional
 * `[WELCOME] …` debug logs from here; one of them wrote the user's email address into
 * production logs. If durable telemetry is wanted, add it via `lib/observability/logEvent.ts`
 * rather than raw console calls.)
 */
export async function sendWelcomeOnOnboardingStart(): Promise<SendWelcomeResult> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    const out: SendWelcomeResult = { ok: false, stage: "no_session" };
    return out;
  }

  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch (e) {
    return { ok: false, stage: "no_org", detail: e };
  }

  if (!orgId) {
    const ensured = await ensureDefaultOrgForUser(user.id, user.email);
    if (!ensured.ok) {
      return { ok: false, stage: "no_org", detail: ensured.error };
    }
    orgId = ensured.orgId;
  }

  // Conditional UPDATE on organization_settings: set welcome_email_sent_at only if currently NULL (idempotency lock)
  // Only send email if this update returns a row (prevents duplicate welcome even if action runs twice)
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("organization_settings")
    .update({ welcome_email_sent_at: new Date().toISOString(), welcome_email_last_error: null })
    .eq("org_id", orgId)
    .is("welcome_email_sent_at", null)
    .select("org_id, welcome_email_sent_at")
    .maybeSingle();

  if (updateError) {
    return { ok: false, stage: "db_error", detail: updateError.message };
  }

  if (!updated) {
    return { ok: false, stage: "already_sent" };
  }

  const result = await sendWelcomeEmail(user.email);

  if (!result.ok) {
    await supabaseAdmin
      .from("organization_settings")
      .update({
        welcome_email_sent_at: null,
        welcome_email_last_error: result.error ?? "Unknown error",
      })
      .eq("org_id", orgId);
    return { ok: false, stage: "resend_error", detail: result.error };
  }

  return { ok: true, stage: "sent" };
}
