import { redirect } from "next/navigation";
import { getOnboardingState } from "./_actions";
import { OnboardingClient } from "./OnboardingClient";
import { getStripeClient } from "@/app/api/billing/stripe/create-draft-invoice-helpers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import Stripe from "stripe";

// Force dynamic rendering to always load fresh org state (disable caching)
export const dynamic = "force-dynamic";

type OnboardingPageProps = {
  searchParams?: Promise<{ checkout?: string; session_id?: string }> | { checkout?: string; session_id?: string };
};

/**
 * Handle checkout success by fetching session from Stripe and activating plan.
 * This is a fallback if webhook is delayed - ensures deterministic UX.
 */
async function handleCheckoutSuccess(sessionId: string) {
  try {
    const stripe = getStripeClient();
    
    // Retrieve session from Stripe with subscription expanded
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Only handle subscription mode checkouts
    if (session.mode !== "subscription") {
      console.log("[onboarding/page] Checkout session is not subscription mode, skipping activation");
      return;
    }

    // Extract metadata
    const orgId = session.metadata?.org_id;
    const planCode = session.metadata?.plan_code?.toLowerCase();

    if (!orgId || !planCode) {
      console.warn("[onboarding/page] Checkout session missing metadata", {
        session_id: sessionId,
        has_org_id: !!orgId,
        has_plan_code: !!planCode,
      });
      return;
    }

    // Validate plan_code
    if (!["starter", "growth", "scale"].includes(planCode)) {
      console.warn("[onboarding/page] Invalid plan_code in checkout session", {
        session_id: sessionId,
        org_id: orgId,
        plan_code: planCode,
      });
      return;
    }

    // Upsert org_plan_overrides (idempotent - safe to run multiple times)
    const { error: overrideError } = await supabaseAdmin
      .from("org_plan_overrides")
      .upsert(
        {
          org_id: orgId,
          plan_code: planCode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" }
      );

    if (overrideError) {
      console.error("[onboarding/page] Error upserting org_plan_overrides", {
        session_id: sessionId,
        org_id: orgId,
        plan_code: planCode,
        error: overrideError.message,
      });
      return;
    }

    // Verify plan is now active by checking org_plan_limits
    const { data: planLimits } = await supabaseAdmin
      .from("org_plan_limits")
      .select("plan_code")
      .eq("org_id", orgId)
      .maybeSingle<{ plan_code: string | null }>();

    const isPlanActive = !!planLimits?.plan_code;

    if (isPlanActive) {
      // Plan is active - set onboarding_step = 5 (Activating, DB step 5 = UI step 4) if current step < 5
      // DB step mapping: 4 = Plan, 5 = Activating, 6 = Live
      // Only update step if current step < 5 (don't downgrade if already at Activating or Live)
      const { data: currentSettings } = await supabaseAdmin
        .from("organization_settings")
        .select("onboarding_step")
        .eq("org_id", orgId)
        .maybeSingle<{ onboarding_step: number | null }>();

      const currentStep = currentSettings?.onboarding_step ?? 0;
      
      if (currentStep < 5) {
        await supabaseAdmin
          .from("organization_settings")
          .update({ onboarding_step: 5 })
          .eq("org_id", orgId);
      }

      console.log("[onboarding/page] Plan activated via checkout session", {
        session_id: sessionId,
        org_id: orgId,
        plan_code: planCode,
      });
    }
  } catch (error) {
    // Log error but don't throw - allow page to render normally
    // Webhook will eventually catch up if this fails
    console.error("[onboarding/page] Error handling checkout success", {
      session_id: sessionId,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default async function OnboardingPage(props: OnboardingPageProps) {
  try {
    // Handle both Promise and direct object for searchParams (Next.js compatibility)
    const searchParams = props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;
    const checkoutParam = searchParams?.checkout;
    const sessionId = searchParams?.session_id;
    
    // If checkout=success and session_id is present, fetch session from Stripe and activate plan
    // This ensures deterministic UX even if webhook is delayed
    if (checkoutParam === "success" && sessionId) {
      await handleCheckoutSuccess(sessionId);
      // Redirect to clean URL (without query params) to avoid re-processing on refresh
      redirect("/onboarding");
    }
    
    const state = await getOnboardingState();
    
    // getOnboardingState() now only reads state - no auto-advance or redirects
    // Webhook handles step updates on plan activation (sets step to 5 = Activating)
    
    // Redirect to dashboard ONLY when onboarding is complete (UI step 5 = Live, DB step >= 6)
    // This is the ONLY place onboarding redirects to dashboard (one-way gate)
    // Dashboard will redirect back if onboarding_step < 6, preventing ping-pong loops
    // CRITICAL: Do NOT redirect based on plan status - only on onboarding_step === 5 (UI) / >= 6 (DB)
    if (state.onboardingStep === 5) {
      redirect("/dashboard");
    }
    
    // Pass checkout status to client for UI handling (no server-side writes)
    // Client handles "Confirming your plan..." UI and polling if plan is not yet active
    const checkoutStatus = checkoutParam === "success" ? "success" : checkoutParam === "cancel" ? "cancel" : null;
    return <OnboardingClient initialState={state} checkoutStatus={checkoutStatus} />;
  } catch (error) {
    // If error is redirect, re-throw it (e.g., from getOnboardingState redirect to /login)
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    
    // For other errors (e.g., missing org), log and show calm error message
    // Missing org/profile is not an auth failure - user should complete onboarding
    console.error("[onboarding/page] Error loading onboarding state:", error);
    
    // Return simple error UI - do NOT redirect to /login from here
    // getOnboardingState() already handles auth redirects server-side
    const errorMessage = error instanceof Error ? error.message : "An error occurred. Please refresh the page.";
    
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 max-w-md">
          <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Setup required</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">{errorMessage}</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            Please refresh the page or try again.
          </p>
        </div>
      </div>
    );
  }
}
