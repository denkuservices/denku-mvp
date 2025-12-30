"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export async function loginAction(formData: FormData) {
  const email = mustString(formData.get("email"), "email");
  const password = mustString(formData.get("password"), "password");

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  redirect("/dashboard");
}
