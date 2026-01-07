"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type SetPasswordResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setPasswordAction(
  password: string,
  confirmPassword: string,
  orgName: string,
  fullName: string
): Promise<SetPasswordResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user (must be authenticated after OTP verification)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated. Please verify your email first." };
  }

  // 2) Validate password
  const validation = SetPasswordSchema.safeParse({ password, confirmPassword });
  if (!validation.success) {
    const firstMsg = validation.error.issues?.[0]?.message ?? "Validation error";
    return { ok: false, error: firstMsg };
  }

  // 3) Set password
  const { error: updateErr } = await supabase.auth.updateUser({
    password: validation.data.password,
  });

  if (updateErr) {
    return { ok: false, error: `Failed to set password: ${updateErr.message}` };
  }

  // 4) Ensure org exists (create if needed)
  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .maybeSingle<{ org_id: string | null }>();

  let orgId: string | null = null;

  if (existingProfile?.org_id) {
    orgId = existingProfile.org_id;
  } else {
    // Create org
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .insert({ name: orgName, created_by: user.id })
      .select("id")
      .single();

    if (orgErr) {
      return { ok: false, error: `Failed to create workspace: ${orgErr.message}` };
    }

    orgId = org.id;
  }

  // 5) Ensure profile exists with correct mapping
  if (!existingProfile) {
    const { error: profErr } = await supabaseAdmin.from("profiles").insert({
      auth_user_id: user.id,
      email: user.email,
      org_id: orgId,
      full_name: fullName,
      role: "owner", // First user is owner
    });

    if (profErr) {
      return { ok: false, error: `Failed to create profile: ${profErr.message}` };
    }
  } else {
    // Update existing profile if needed
    const { error: updateProfErr } = await supabaseAdmin
      .from("profiles")
      .update({
        org_id: orgId,
        full_name: fullName,
        email: user.email,
        role: "owner", // Ensure owner role
      })
      .eq("auth_user_id", user.id);

    if (updateProfErr) {
      return { ok: false, error: `Failed to update profile: ${updateProfErr.message}` };
    }
  }

  // After password is set, check if email is confirmed before redirecting
  const { data: { user: updatedUser } } = await supabase.auth.getUser();
  const emailConfirmed = updatedUser ? ((updatedUser as any).email_confirmed_at || (updatedUser as any).confirmed_at) : false;

  if (emailConfirmed) {
    redirect("/dashboard");
  } else {
    // Email not confirmed yet, redirect back to verify-email
    redirect(`/verify-email?email=${encodeURIComponent(updatedUser?.email || "")}`);
  }
}

