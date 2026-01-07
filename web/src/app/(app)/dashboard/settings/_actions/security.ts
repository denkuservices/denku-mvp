"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ChangePasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Change user password (email/password provider only).
 * Returns discriminated union: { ok: true } | { ok: false, error }
 */
export async function changePassword(
  input: { password: string; confirmPassword: string }
): Promise<ChangePasswordResult> {
  const supabase = await createSupabaseServerClient();

  // 1) Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  // 2) Validate input
  const validation = ChangePasswordSchema.safeParse(input);
  if (!validation.success) {
    const firstMsg = validation.error.issues?.[0]?.message ?? "Validation error";
    return { ok: false, error: firstMsg };
  }

  // 3) Update password via Supabase Auth
  const { error: updateErr } = await supabase.auth.updateUser({
    password: validation.data.password,
  });

  if (updateErr) {
    return { ok: false, error: `Failed to update password: ${updateErr.message}` };
  }

  return { ok: true };
}

/**
 * Sign out all devices (global sign out).
 * Returns success status. Client should handle redirect.
 */
export async function signOutAllDevices(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signOut({ scope: "global" });

  if (error) {
    return { ok: false, error: `Failed to sign out: ${error.message}` };
  }

  return { ok: true };
}

