import { redirect } from "next/navigation";
import { getOnboardingState } from "./_actions";
import { OnboardingClient } from "./OnboardingClient";

// Force dynamic rendering to always load fresh org state (disable caching)
export const dynamic = "force-dynamic";

type OnboardingPageProps = {
  searchParams?: Promise<{ checkout?: string }> | { checkout?: string };
};

export default async function OnboardingPage(props: OnboardingPageProps) {
  try {
    // Handle both Promise and direct object for searchParams (Next.js compatibility)
    const searchParams = props.searchParams instanceof Promise ? await props.searchParams : props.searchParams;
    const checkoutParam = searchParams?.checkout;
    
    const state = await getOnboardingState();
    
    // If checkout=success: set step=3 and persist (idempotent)
    // This handles Stripe success redirect
    if (checkoutParam === "success") {
      const { updateOnboardingStep } = await import("./_actions");
      // Always set step=3 on checkout success (idempotent)
      await updateOnboardingStep(state.orgId, 3);
      // Update state with step=3
      state.onboardingStep = 3;
    }
    
    // If plan is active and step >= 4, redirect to dashboard (onboarding complete)
    // But allow step 3 to proceed (activation)
    if (state.isPlanActive && state.onboardingStep >= 4) {
      redirect("/dashboard");
    }
    
    // Pass checkout param to client for handling
    return <OnboardingClient initialState={state} checkoutParam={checkoutParam} />;
  } catch (error) {
    // If error is redirect, re-throw it
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    // Otherwise redirect to login
    redirect("/login");
  }
}
