import "server-only";

import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeEmailLocale, type EmailLocale } from "./i18n";

export async function resolveRequestEmailLocale(): Promise<EmailLocale> {
  try {
    return normalizeEmailLocale((await cookies()).get("NEXT_LOCALE")?.value);
  } catch {
    // Unit jobs and non-request server contexts do not have a cookie store.
    return "en";
  }
}

/** Resolve the language saved by a signed-in user. English is the safe legacy fallback. */
export async function resolveUserEmailLocale(authUserId: string): Promise<EmailLocale> {
  if (!authUserId) return "en";

  const { data } = await supabaseAdmin
    .from("profiles")
    .select("ui_locale")
    .eq("auth_user_id", authUserId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ ui_locale: string | null }>();

  return normalizeEmailLocale(data?.ui_locale);
}

/**
 * Resolve the locale of the actual recipient where possible, then fall back to the
 * workspace owner. Every service-role read remains scoped to the target workspace.
 */
export async function resolveOrgEmailLocale(
  orgId: string,
  recipientEmail?: string | null
): Promise<EmailLocale> {
  if (!orgId) return "en";

  if (recipientEmail?.trim()) {
    const { data: recipient } = await supabaseAdmin
      .from("profiles")
      .select("ui_locale")
      .eq("org_id", orgId)
      .ilike("email", recipientEmail.trim())
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ ui_locale: string | null }>();
    if (recipient?.ui_locale) return normalizeEmailLocale(recipient.ui_locale);
  }

  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("ui_locale")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ ui_locale: string | null }>();

  return normalizeEmailLocale(owner?.ui_locale);
}
