"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPlanState } from "@/lib/billing/planState";

function mustString(v: FormDataEntryValue | null, field: string) {
  if (!v || typeof v !== "string" || !v.trim()) throw new Error(`Missing ${field}`);
  return v.trim();
}

export type LoginResult =
  | { ok: true; next: "dashboard" | "onboarding"; email: string }
  | { ok: false; error: string };

export async function loginAction(formData: FormData): Promise<LoginResult> {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Early guard: Check if user already has an active session
    // If session exists, redirect to dashboard immediately
    const { data: { user: existingUser } } = await supabase.auth.getUser();
    if (existingUser && existingUser.id) {
      // User already logged in - redirect to dashboard
      const userEmail = existingUser.email ?? "";
      redirect("/dashboard");
      // This line should never execute due to redirect, but TypeScript needs it
      return { ok: true, next: "dashboard", email: userEmail };
    }

    const email = mustString(formData.get("email"), "email");
    const password = mustString(formData.get("password"), "password");

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
      /**
       * Has this workspace bought anything — voice, chat, or both?
       *
       * It used to ask only whether a VOICE plan existed, which sent a chat-only customer back
       * into onboarding at every sign-in. See `lib/billing/planState.ts`.
       *
       * The fail-open behaviour below is deliberate and preserved: this decides between the
       * dashboard and a signup flow, which is gating, and a broken query must never trap a paying
       * customer in onboarding. `resolved` is exactly what distinguishes "this workspace has no
       * plan" from "we could not find out".
       */
      const planState = await getPlanState(orgId);
      const planActive = planState.resolved ? planState.hasAnyPlan : true;
      if (!planState.resolved) {
        console.error("[loginAction] Plan check unresolved — defaulting to dashboard", { orgId });
      }

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
    // Next.js digest often starts with "NEXT_REDIRECT;" not just equals "NEXT_REDIRECT"
    const digest = (err as any)?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      // Re-throw redirect - this is expected and should propagate
      throw err;
    }
    
    // Only log unexpected system errors (e.g., missing env, network issues)
    // NOT for invalid credentials (handled above) or redirects
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    const errorStack = err instanceof Error ? err.stack : undefined;
    console.error("[loginAction] Unexpected error:", errorMsg);
    if (errorStack) {
      console.error("[loginAction] Error stack:", errorStack);
    }
    
    // For truly unexpected errors, still return structured error instead of throwing
    // This prevents SSR crash while still logging the error
    return { ok: false, error: "An unexpected error occurred. Please try again." };
  }
}
