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

export async function signupAction(formData: FormData) {
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
    throw new Error(error.message);
  }

  const user = data.user;
  if (!user) {
    throw new Error("Signup failed: no user returned");
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
      console.error("[signupAction] Failed to create org:", orgErr);
      throw new Error(`Failed to create workspace: ${orgErr.message}`);
    }

    if (!org?.id) {
      console.error("[signupAction] Org created but no id returned");
      throw new Error("Failed to create workspace: No organization ID returned");
    }

    orgId = org.id;
  } catch (err) {
    console.error("[signupAction] Org creation error:", err);
    throw err instanceof Error ? err : new Error("Failed to create workspace");
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
      console.error("[signupAction] Failed to upsert profile:", profErr);
      throw new Error(`Failed to create profile: ${profErr.message}`);
    }
  } catch (err) {
    console.error("[signupAction] Profile upsert error:", err);
    throw err instanceof Error ? err : new Error("Failed to create profile");
  }

  // 4) If session exists (email confirmation disabled in dev), redirect to dashboard
  if (data.session) {
    redirect("/dashboard");
  }

  // 5) Otherwise, redirect to verify-email page
  redirect(`/verify-email?email=${encodeURIComponent(email)}`);
}
