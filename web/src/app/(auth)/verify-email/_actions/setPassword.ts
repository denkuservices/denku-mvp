"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

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
  // Create Supabase server client with cookie-aware setup
  // This ensures auth cookies are persisted after updateUser
  const supabase = await createSupabaseServerClient();

  // 1) Get current user (must be authenticated after OTP verification)
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError || !user) {
    console.error("[setPassword] Session missing before update:", getUserError?.message);
    return { ok: false, error: "Session expired. Please verify again." };
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
    console.error("[setPassword] Password update error:", updateErr.message);
    return { ok: false, error: "Failed to set password. Please try again." };
  }

  // 4) CRITICAL: Verify session is still valid after updateUser
  // This ensures cookies were persisted and session is readable
  // Access cookie store to ensure cookie writes are committed
  const cookieStore = await cookies();
  
  // Verify session persists by calling getUser again
  const {
    data: { user: updatedUser },
    error: sessionVerifyError,
  } = await supabase.auth.getUser();

  if (sessionVerifyError || !updatedUser) {
    console.error("[setPassword] Session lost after updateUser:", sessionVerifyError?.message);
    return { ok: false, error: "Session expired. Please verify again." };
  }

  // TEMP: Debug log cookie names (not values) in development only
  if (process.env.NODE_ENV !== "production") {
    const cookieNames = cookieStore.getAll().map((c: any) => c.name).filter((name: string) => 
      name.includes("auth-token") || name.includes("supabase") || name.includes("sb-")
    );
    console.log("[setPassword] Auth cookies after updateUser:", {
      cookieNames,
      hasUpdatedUser: !!updatedUser,
    });
  }

  // 5) Session is confirmed valid - return success
  // Client will handle navigation to /onboarding
  // Org/workspace/full_name/phone will be collected in onboarding step 0
  return { ok: true };
}

