"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBaseUrl } from "@/lib/utils/url";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function sendCodeAction(formData: FormData) {
  const email = mustString(formData.get("email"), "email");

  const supabase = await createSupabaseServerClient();

  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  // Send OTP code
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: true,
    },
  });

  if (error) {
    // Generic error to avoid leaking email existence
    throw new Error("Failed to send verification code. Please try again.");
  }

  // Redirect to verify page with email
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}

