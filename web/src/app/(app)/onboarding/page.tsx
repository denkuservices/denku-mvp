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
    
    // If plan is active, redirect to dashboard (paid org should not be in onboarding)
    if (state.isPlanActive) {
      redirect("/dashboard");
    }
    
    // If checkout success and plan is active, auto-advance to activation step
    if (checkoutParam === "success" && state.isPlanActive && state.onboardingStep === 2) {
      // Update onboarding_step to 3 (activate)
      // This will be handled by client-side state refresh
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
