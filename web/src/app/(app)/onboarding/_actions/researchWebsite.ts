"use server";

import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { researchWebsiteForOrg } from "@/lib/platform/websiteResearch";

/**
 * Read the website the customer gave us, once.
 *
 * Fired from the browser after the workspace step rather than awaited inside it: reading a site
 * costs up to eight seconds, and an optional field must never put eight seconds in front of the
 * Continue button. By the time the customer reaches Knowledge it is already done.
 *
 * Returns nothing useful on purpose — the caller does not wait for it and there is nothing to
 * show. What it finds lands in `organization_settings.website_facts`, where the Knowledge form
 * reads it as placeholder text and the draft reads it as input. Nothing it finds is ever written
 * into the employee without a person confirming it.
 */
export async function researchWebsiteAction(): Promise<{ ok: boolean }> {
  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    return { ok: false };
  }
  if (!orgId) return { ok: false };

  const { data } = await supabaseAdmin
    .from("organization_settings")
    .select("website_url, website_checked_at")
    .eq("org_id", orgId)
    .maybeSingle<{ website_url: string | null; website_checked_at: string | null }>();

  const url = data?.website_url?.trim();
  if (!url) return { ok: false };

  // Already attempted. A second read would cost another fetch and another model call to learn
  // the same thing, and a site that could not be read the first time is not likelier now.
  if (data?.website_checked_at) return { ok: true };

  const result = await researchWebsiteForOrg(orgId, url);
  return { ok: result.ok };
}
