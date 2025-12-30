"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function signupAction(formData: FormData) {
  const org_name = mustString(formData.get("org_name"), "org_name");
  const full_name = mustString(formData.get("full_name"), "full_name");
  const email = mustString(formData.get("email"), "email");
  const password = mustString(formData.get("password"), "password");

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user) throw new Error("Signup failed: no user returned");

  const { data: org, error: orgErr } = await supabaseAdmin
    .from("orgs")
    .insert({ name: org_name, created_by: user.id })
    .select("id")
    .single();

  if (orgErr) throw new Error(orgErr.message);

  const { error: profErr } = await supabaseAdmin.from("profiles").insert({
    id: user.id,
    org_id: org.id,
    email,
    full_name,
  });

  if (profErr) throw new Error(profErr.message);

  if (!data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  redirect("/dashboard");
}
