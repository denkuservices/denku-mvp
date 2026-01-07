"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Validation schema - accept string | undefined, normalize empty to null
const UpdateAccountProfileSchema = z.object({
  full_name: z
    .union([z.string(), z.undefined()])
    .transform((val) => {
      if (val === undefined) return undefined;
      const trimmed = val.trim();
      if (trimmed.length > 120) throw new Error("Full name must be 120 characters or less");
      return trimmed || null;
    })
    .optional(),
  phone: z
    .union([z.string(), z.undefined()])
    .transform((val) => {
      if (val === undefined) return undefined;
      const trimmed = val.trim();
      if (trimmed.length > 32) throw new Error("Phone must be 32 characters or less");
      return trimmed || null;
    })
    .optional(),
});

type UpdateAccountProfileInput = z.infer<typeof UpdateAccountProfileSchema>;

export type UpdateAccountProfileResult =
  | { ok: true; profile: { id: string; email: string | null; full_name: string | null; phone: string | null; auth_user_id: string; updated_at: string } }
  | { ok: false; error: string };

/**
 * Update account profile (full_name and phone).
 * Users can only update their own profile (enforced by RLS).
 * Returns discriminated union: { ok: true } | { ok: false, error }
 */
export async function updateAccountProfile(
  input: UpdateAccountProfileInput
): Promise<UpdateAccountProfileResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // 2) Validate input
  const validation = UpdateAccountProfileSchema.safeParse(input);
  if (!validation.success) {
    const firstMsg = validation.error.issues?.[0]?.message ?? "Validation error";
    return { ok: false, error: firstMsg };
  }
  const validated = validation.data;

  // 3) Build update payload (always include fields that were provided, normalize empty to null)
  const updatePayload: {
    full_name?: string | null;
    phone?: string | null;
  } = {};

  if (validated.full_name !== undefined) {
    const rawFullName = (validated.full_name ?? "").trim();
    updatePayload.full_name = rawFullName.length === 0 ? null : rawFullName;
  }

  if (validated.phone !== undefined) {
    const rawPhone = (validated.phone ?? "").trim();
    const normalizedPhone = rawPhone.length === 0 ? null : rawPhone;
    updatePayload.phone = normalizedPhone;
    console.log("[updateAccountProfile] Normalized phone:", normalizedPhone === null ? "NULL" : `string(${normalizedPhone.length} chars)`);
  }

  // If no fields to update, return early
  if (Object.keys(updatePayload).length === 0) {
    return { ok: false, error: "No fields to update" };
  }

  // 4) Update profile (RLS ensures user can only update their own row via auth_user_id)
  console.log("[updateAccountProfile] user.id:", user.id, "user.email:", user.email, "payload:", updatePayload);
  
  let { data: updateData, error: updateErr } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("auth_user_id", user.id)
    .select("id");

  if (updateErr) {
    console.error("[updateAccountProfile] Update error:", updateErr);
    return { ok: false, error: `Failed to update profile: ${updateErr.message}` };
  }

  // If 0 rows affected, try claim-by-email fallback
  if (!updateData || updateData.length === 0) {
    console.log("[updateAccountProfile] No rows by auth_user_id, attempting claim-by-email");
    
    // Claim profile by email (set auth_user_id if null or mismatched)
    const { error: claimErr } = await supabase
      .from("profiles")
      .update({ auth_user_id: user.id })
      .eq("email", user.email)
      .or(`auth_user_id.is.null,auth_user_id.neq.${user.id}`);

    if (claimErr) {
      console.error("[updateAccountProfile] Claim-by-email error:", claimErr);
    } else {
      // Retry update after claiming
      const retryResult = await supabase
        .from("profiles")
        .update(updatePayload)
        .eq("auth_user_id", user.id)
        .select("id");
      
      updateData = retryResult.data;
      updateErr = retryResult.error;
    }

    if (!updateData || updateData.length === 0) {
      console.error("[updateAccountProfile] Still no rows after claim-by-email");
      return { ok: false, error: "Profile mapping missing. Please refresh the page." };
    }
  }

  // 5) Fetch updated profile to confirm and return
  const { data: updatedProfile, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, auth_user_id, updated_at")
    .eq("auth_user_id", user.id)
    .maybeSingle<{ id: string; email: string | null; full_name: string | null; phone: string | null; auth_user_id: string; updated_at: string }>();

  if (fetchErr) {
    console.error("[updateAccountProfile] Fetch error:", fetchErr);
    return { ok: false, error: `Failed to verify update: ${fetchErr.message}` };
  }

  if (!updatedProfile) {
    console.error("[updateAccountProfile] Profile not found after update");
    return { ok: false, error: "Update succeeded but profile not found" };
  }

  console.log("[updateAccountProfile] Update successful, updated_at:", updatedProfile.updated_at);
  return { ok: true, profile: updatedProfile };
}

