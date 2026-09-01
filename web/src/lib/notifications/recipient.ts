import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resolve the best contact email for an org. Shared by billing/pause alerts (R-009) and artifact
 * notifications (R-008). Returns null if no address is known.
 *
 * Three steps, most specific first:
 *
 *   1. `notification_email` — the address the workspace explicitly nominated in
 *      Settings → Notifications. Added after the settings audit: everything operational used to
 *      land on whoever happened to be the billing contact, which for a business with a bookkeeper
 *      is the wrong human for "a customer left a message".
 *   2. `billing_email` — the historical answer, and still right for money.
 *   3. the owner's profile email — the last resort, and the reason step 1 exists: this is somebody's
 *      personal inbox.
 *
 * A `select` naming a column the database does not have fails the whole query, so the nominated
 * address is read on its own and its failure is ignored — an environment without the migration
 * behaves exactly as it did before.
 */
export async function resolveOrgOwnerEmail(orgId: string): Promise<string | null> {
  const { data: nominated } = await supabaseAdmin
    .from("organization_settings")
    .select("notification_email")
    .eq("org_id", orgId)
    .maybeSingle<{ notification_email: string | null }>();

  const nominatedEmail = nominated?.notification_email?.trim();
  if (nominatedEmail) return nominatedEmail;

  const { data: settings } = await supabaseAdmin
    .from("organization_settings")
    .select("billing_email")
    .eq("org_id", orgId)
    .maybeSingle<{ billing_email: string | null }>();

  const billing = settings?.billing_email?.trim();
  if (billing) return billing;

  const { data: owner } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("org_id", orgId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle<{ email: string | null }>();

  const email = owner?.email?.trim();
  return email && email.length > 0 ? email : null;
}
