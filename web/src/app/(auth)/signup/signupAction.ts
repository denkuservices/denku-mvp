"use server";

import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function signupAction(formData: FormData) {
  const org_name = mustString(formData.get("org_name"), "org_name");
  const full_name = mustString(formData.get("full_name"), "full_name");
  const email = mustString(formData.get("email"), "email");
  const password = mustString(formData.get("password"), "password");

  // 1) Create auth user
  const { data, error } = await supabaseServer.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  const user = data.user;
  if (!user) throw new Error("Signup failed: no user returned");

  // 2) Create org
  const { data: org, error: orgErr } = await supabaseServer
    .from("orgs")
    .insert({ name: org_name, created_by: user.id })
    .select("id")
    .single();

  if (orgErr) throw new Error(orgErr.message);

  // 3) Create profile
  const { error: profErr } = await supabaseServer.from("profiles").insert({
    id: user.id,
    org_id: org.id,
    email,
    full_name,
  });

  if (profErr) throw new Error(profErr.message);

  // 4) If email confirmation is enabled, session may be null
  if (!data.session) {
    redirect(`/verify-email?email=${encodeURIComponent(email)}`);
  }

  // 5) Otherwise, user is signed in; go to dashboard
  redirect("/dashboard");
}
