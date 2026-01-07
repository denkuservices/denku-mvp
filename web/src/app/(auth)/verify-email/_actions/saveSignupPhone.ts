"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SaveSignupPhoneResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Save phone number from signup to user's profile.
 * Called after email verification and password setting.
 */
export async function saveSignupPhoneAction(phone: string | null): Promise<SaveSignupPhoneResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user (must be authenticated after OTP verification)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // 2) Normalize phone
  const normalizedPhone = phone ? phone.trim().slice(0, 32) : null;
  const finalPhone = normalizedPhone && normalizedPhone.length > 0 ? normalizedPhone : null;

  // 3) Update profile
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ phone: finalPhone })
    .eq("auth_user_id", user.id);

  if (updateErr) {
    // If profile doesn't exist yet, try to create it (shouldn't happen in normal flow)
    // But we'll just return error to be safe
    return { ok: false, error: `Failed to save phone: ${updateErr.message}` };
  }

  return { ok: true };
}

