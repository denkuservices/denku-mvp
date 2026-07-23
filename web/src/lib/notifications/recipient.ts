import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Resolve the best contact email for an org: explicit workspace `billing_email`,
 * else the owner's profile email. Shared by billing/pause alerts (R-009) and
 * artifact notifications (R-008). Returns null if no address is known.
 */
export async function resolveOrgOwnerEmail(orgId: string): Promise<string | null> {
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
