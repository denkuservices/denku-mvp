"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function sendCodeAction(formData: FormData) {
  const email = mustString(formData.get("email"), "email");

  const supabase = await createSupabaseServerClient();

  // Get base URL for email redirect
  function getBaseUrl(): string {
    if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }

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

