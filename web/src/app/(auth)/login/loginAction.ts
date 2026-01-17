"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export type LoginResult =
  | { ok: true; next: "dashboard" | "onboarding"; email: string }
  | { ok: false; error: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  try {
    const email = mustString(formData.get("email"), "email");
    const password = mustString(formData.get("password"), "password");

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    // Handle auth errors gracefully - do NOT throw
    if (error) {
      // Log server-side for debugging
      console.error("[loginAction] Supabase auth error:", error.message, error.status);
      
      // Return user-friendly error message
      const errorMsg = error.message.toLowerCase();
      if (
        errorMsg.includes("invalid") ||
        errorMsg.includes("credentials") ||
        errorMsg.includes("email") ||
        errorMsg.includes("password") ||
        error.status === 400
      ) {
        return { ok: false, error: "Invalid email or password" };
      }
      
      // Other auth errors
      return { ok: false, error: error.message || "Failed to sign in. Please try again." };
    }

    // Check onboarding completion status
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error("[loginAction] SignIn succeeded but no user returned");
      return { ok: false, error: "Failed to sign in. Please try again." };
    }

    // Get org_id
    const { data: profiles } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    let redirectTo: "dashboard" | "onboarding" = "dashboard";
    if (profiles && profiles.length > 0 && profiles[0].org_id) {
      const orgId = profiles[0].org_id;
      // Check plan active status (plan is active if org_plan_limits.plan_code exists)
      const { data: planLimits } = await supabaseAdmin
        .from("org_plan_limits")
        .select("plan_code")
        .eq("org_id", orgId)
        .maybeSingle<{ plan_code: string | null }>();

      const planActive = !!planLimits?.plan_code;
      if (!planActive) {
        redirectTo = "onboarding";
      }
    }

    // Use redirect for successful login (Next.js server action redirect pattern)
    if (redirectTo === "dashboard") {
      redirect("/dashboard");
    } else {
      redirect("/onboarding");
    }
    
    // This line should never execute due to redirect, but TypeScript needs it
    return { ok: true, next: redirectTo, email };
  } catch (err) {
    // Check if error is NEXT_REDIRECT (expected when redirect() is called)
    // Do NOT log NEXT_REDIRECT as an error - it's expected behavior
    if (err && typeof err === "object" && "digest" in err && err.digest === "NEXT_REDIRECT") {
      // Re-throw redirect - this is expected and should propagate
      throw err;
    }
    
    // Only log unexpected system errors (e.g., missing env, network issues)
    // NOT for invalid credentials (handled above) or redirects
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    console.error("[loginAction] Unexpected error:", errorMsg);
    
    // For truly unexpected errors, still return structured error instead of throwing
    // This prevents SSR crash while still logging the error
    return { ok: false, error: "An unexpected error occurred. Please try again." };
  }
}
