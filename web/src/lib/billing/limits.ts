import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Get effective limits for an organization (plan base + add-ons).
 * 
 * Rules:
 * - Base plan limits from billing_plan_catalog for org's current plan
 * - Add-on quantities from billing_org_addons (qty where status='active')
 * - Effective limits = base + addons
 * - Always queries DB (no caching) to ensure correctness
 * 
 * Returns effective limits with plan info and addon quantities.
 */
export async function getEffectiveLimits(orgId: string): Promise<{
  max_concurrent_calls: number;
  included_phones: number;
  plan_key: string;
  addons: { extra_concurrency: number; extra_phone: number };
}> {
  // 1) Get org's current plan code
  const { data: planLimits } = await supabaseAdmin
    .from("org_plan_limits")
    .select("plan_code")
    .eq("org_id", orgId)
    .maybeSingle<{ plan_code: string | null }>();

  const planCode = planLimits?.plan_code || "starter";
  const planKey = planCode.toLowerCase();

  // 2) Get base plan limits from billing_plan_catalog
  const { data: planCatalog } = await supabaseAdmin
    .from("billing_plan_catalog")
    .select("concurrency_limit, included_phone_numbers")
    .eq("plan_code", planKey)
    .maybeSingle<{
      concurrency_limit: number | null;
      included_phone_numbers: number | null;
    }>();

  const baseConcurrency = planCatalog?.concurrency_limit ? Number(planCatalog.concurrency_limit) : 0;
  const basePhones = planCatalog?.included_phone_numbers ? Number(planCatalog.included_phone_numbers) : 0;

  // 3) Get active add-on quantities from billing_org_addons
  const { data: orgAddons } = await supabaseAdmin
    .from("billing_org_addons")
    .select("addon_key, qty")
    .eq("org_id", orgId)
    .eq("status", "active");

  let extraConcurrency = 0;
  let extraPhone = 0;

  for (const row of orgAddons || []) {
    const qty = Number(row.qty || 0);
    if (row.addon_key === "extra_concurrency") {
      extraConcurrency = qty;
    } else if (row.addon_key === "extra_phone") {
      extraPhone = qty;
    }
  }

  // 4) Compute effective limits
  const maxConcurrentCalls = baseConcurrency + extraConcurrency;
  const includedPhones = basePhones + extraPhone;

  return {
    max_concurrent_calls: Math.max(0, maxConcurrentCalls), // Ensure non-negative
    included_phones: Math.max(0, includedPhones), // Ensure non-negative
    plan_key: planKey,
    addons: {
      extra_concurrency: extraConcurrency,
      extra_phone: extraPhone,
    },
  };
}

/**
 * Check if workspace is paused (billing or manual).
 * Returns true if workspace_status='paused' for any reason.
 */
export async function isWorkspacePaused(orgId: string): Promise<boolean> {
  const { data: orgSettings } = await supabaseAdmin
    .from("organization_settings")
    .select("workspace_status")
    .eq("org_id", orgId)
    .maybeSingle<{
      workspace_status: "active" | "paused" | null;
    }>();

  return orgSettings?.workspace_status === "paused";
}
