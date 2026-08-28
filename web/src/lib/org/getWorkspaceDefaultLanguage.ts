import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { toLanguageCode, type LanguageCode } from "@/lib/language/registry";

/**
 * The workspace's default language, normalized (2026-08-28).
 *
 * Settings → Workspace → Identity offers a "Default language" whose own helper text reads
 * "Starting point for new employees; each can override it." Nothing read the column. An owner
 * could set it to Spanish, watch it save, hire an employee, and get one that answered in English —
 * a promise the product made in writing and did not keep.
 *
 * Normalized on the way out because the two writers disagree: onboarding stores the ISO code
 * ("es") and the Setup editor stores the label ("Spanish"). That is R-135, and every reader of a
 * language now goes through the registry rather than guessing which spelling it received.
 *
 * Never throws and always answers: hiring an employee must not fail because a default could not
 * be read, so an unreadable or unspeakable value resolves to the product default.
 */
export async function getWorkspaceDefaultLanguage(orgId: string | null): Promise<LanguageCode> {
  if (!orgId) return "en";
  try {
    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("default_language")
      .eq("org_id", orgId)
      .maybeSingle<{ default_language: string | null }>();
    return toLanguageCode(data?.default_language) ?? "en";
  } catch (err) {
    console.error(
      "[ORG][DEFAULT_LANGUAGE]",
      err instanceof Error ? err.message : String(err)
    );
    return "en";
  }
}
