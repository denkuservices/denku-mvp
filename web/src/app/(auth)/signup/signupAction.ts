"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBaseUrl } from "@/lib/utils/url";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

function optionalString(v: FormDataEntryValue | null): string | null {
  if (!v || typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type SignupResult =
  | { ok: true; next: "dashboard" | "verify-email"; email: string }
  | { ok: false; code: "USER_EXISTS" | "VALIDATION" | "UNKNOWN"; error: string };

export async function signupAction(formData: FormData): Promise<SignupResult> {
  const org_name = mustString(formData.get("org_name"), "org_name");
  const full_name = mustString(formData.get("full_name"), "full_name");
  const email = mustString(formData.get("email"), "email");
  const password = mustString(formData.get("password"), "password");
  const phone = optionalString(formData.get("phone"));

  const supabase = await createSupabaseServerClient();
  const baseUrl = getBaseUrl();
  const emailRedirectTo = `${baseUrl}/auth/callback`;

  // 1) Sign up user with email+password (Confirm sign up flow)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    console.error("[signupAction] Supabase auth error:", error.message, error.status);
    
    // Detect "user already exists" errors
    const errorMsg = error.message.toLowerCase();
    if (
      errorMsg.includes("already registered") ||
      errorMsg.includes("user already registered") ||
      errorMsg.includes("email address is already registered") ||
      error.status === 422 // Supabase often returns 422 for existing users
    ) {
      return {
        ok: false,
        code: "USER_EXISTS",
        error: "Account already exists",
      };
    }

    // Other validation errors
    if (error.status === 400 || errorMsg.includes("validation")) {
      return {
        ok: false,
        code: "VALIDATION",
        error: error.message || "Invalid input. Please check your information.",
      };
    }

    // Unknown errors
    return {
      ok: false,
      code: "UNKNOWN",
      error: "Failed to create account. Please try again.",
    };
  }

  const user = data.user;
  if (!user) {
    console.error("[signupAction] Signup succeeded but no user returned");
    return {
      ok: false,
      code: "UNKNOWN",
      error: "Signup failed: no user returned. Please try again.",
    };
  }

  // 2) Create org/workspace (use "orgs" table as per existing codebase)
  let orgId: string;
  try {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .insert({ name: org_name, created_by: user.id })
      .select("id")
      .single();

    if (orgErr) {
      console.error("[signupAction] Failed to create org:", orgErr.message, orgErr.code);
      return {
        ok: false,
        code: "UNKNOWN",
        error: `Failed to create workspace: ${orgErr.message}`,
      };
    }

    if (!org?.id) {
      console.error("[signupAction] Org created but no id returned");
      return {
        ok: false,
        code: "UNKNOWN",
        error: "Failed to create workspace: No organization ID returned",
      };
    }

    orgId = org.id;
  } catch (err) {
    console.error("[signupAction] Org creation exception:", err);
    return {
      ok: false,
      code: "UNKNOWN",
      error: "Failed to create workspace. Please try again.",
    };
  }

  // 3) Upsert profile with id and auth_user_id mapping (idempotent)
  const normalizedPhone = phone ? phone.trim().slice(0, 32) : null;
  const finalPhone = normalizedPhone && normalizedPhone.length > 0 ? normalizedPhone : null;

  try {
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: user.id, // Required: profiles.id is NOT NULL
          auth_user_id: user.id,
          email,
          org_id: orgId,
          full_name,
          phone: finalPhone,
          role: "owner", // First user is owner
        },
        {
          onConflict: "id", // Use id as conflict target
        }
      );

    if (profErr) {
      console.error("[signupAction] Failed to upsert profile:", profErr.message, profErr.code);
      return {
        ok: false,
        code: "UNKNOWN",
        error: `Failed to create profile: ${profErr.message}`,
      };
    }
  } catch (err) {
    console.error("[signupAction] Profile upsert exception:", err);
    return {
      ok: false,
      code: "UNKNOWN",
      error: "Failed to create profile. Please try again.",
    };
  }

  // 4) Determine next step
  const next: "dashboard" | "verify-email" = data.session ? "dashboard" : "verify-email";

  return {
    ok: true,
    next,
    email,
  };
}
