"use server";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type EnsureDefaultOrgResult = { ok: true; orgId: string; created: boolean } | { ok: false; error: string };

/** Defensive: convert empty or whitespace phone to null to avoid unique constraint on phone_number. */
function sanitizePhone(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const t = String(phone).trim();
  return t === "" ? null : t;
}

/**
 * Ensure the user has a default organization and profile link.
 * Default org id is deterministic: orgId = userId (one default org per user, no duplicate orgs on double-invocation).
 *
 * @param userId - auth.users.id
 * @param userEmail - user email (used for org name and profile)
 * @returns orgId and whether org was created (true) or already existed (false)
 */
export async function ensureDefaultOrgForUser(
  userId: string,
  userEmail: string
): Promise<EnsureDefaultOrgResult> {
  // Deterministic default org id: one org per user, prevents duplicate orgs on double-invocation
  const orgId = userId;
  const now = new Date().toISOString();
  const namePart = userEmail.split("@")[0]?.trim() || "user";
  const safeName = namePart.replace(/[^\w\s-]/g, "").slice(0, 32) || "My";
  const orgName = `${safeName}'s Workspace`;

  try {
    // 1) First try SELECT org by id = orgId (deterministic)
    const { data: existingOrg } = await supabaseAdmin
      .from("orgs")
      .select("id")
      .eq("id", orgId)
      .maybeSingle();

    if (existingOrg) {
      // Org already exists: ensure organization_settings and profile link exist (idempotent), then return
      console.log("[ensureDefaultOrgForUser] orgId", orgId, "already existed"); // TEMP DEBUG
      await supabaseAdmin
        .from("organization_settings")
        .upsert({ org_id: orgId }, { onConflict: "org_id" });
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: userId,
            auth_user_id: userId,
            email: userEmail,
            org_id: orgId,
            full_name: null,
            phone: null,
            role: "owner",
          },
          { onConflict: "id" }
        );
      if (profileError) {
        console.error("[ensureDefaultOrgForUser] profiles upsert (existing org) error:", profileError.message);
      }
      return { ok: true, orgId, created: false };
    }

    // 2) Org does not exist: idempotent upsert so double-invocation never hits orgs_pkey
    const orgsPayload = { id: orgId, name: orgName, created_at: now, created_by: userId };
    console.log("[ensureDefaultOrgForUser] orgs payload keys", Object.keys(orgsPayload)); // TEMP DEBUG
    const { error: orgError } = await supabaseAdmin.from("orgs").upsert(orgsPayload, { onConflict: "id" });
    if (orgError) {
      console.error("[ensureDefaultOrgForUser] orgs upsert error:", orgError.message);
      return { ok: false, error: orgError.message };
    }

    const legacyPayload = { id: orgId, name: orgName, created_at: now };
    console.log("[ensureDefaultOrgForUser] organizations_legacy payload keys", Object.keys(legacyPayload)); // TEMP DEBUG
    const { error: legacyError } = await supabaseAdmin
      .from("organizations_legacy")
      .upsert(legacyPayload, { onConflict: "id" });
    if (legacyError) {
      console.error("[ensureDefaultOrgForUser] organizations_legacy upsert error:", legacyError.message);
      return { ok: false, error: legacyError.message };
    }

    const { error: settingsError } = await supabaseAdmin
      .from("organization_settings")
      .upsert({ org_id: orgId }, { onConflict: "org_id" });
    if (settingsError) {
      console.error("[ensureDefaultOrgForUser] organization_settings upsert error:", settingsError.message);
      return { ok: false, error: settingsError.message };
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          auth_user_id: userId,
          email: userEmail,
          org_id: orgId,
          full_name: null,
          phone: null,
          role: "owner",
        },
        { onConflict: "id" }
      );
    if (profileError) {
      console.error("[ensureDefaultOrgForUser] profiles upsert error:", profileError.message);
      return { ok: false, error: profileError.message };
    }

    console.log("[ensureDefaultOrgForUser] orgId", orgId, "created"); // TEMP DEBUG
    return { ok: true, orgId, created: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[ensureDefaultOrgForUser] unexpected error:", message);
    return { ok: false, error: message };
  }
}
