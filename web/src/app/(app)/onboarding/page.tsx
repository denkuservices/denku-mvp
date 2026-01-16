import { redirect } from "next/navigation";
import { getOnboardingState } from "./_actions";
import { OnboardingClient } from "./OnboardingClient";

// Force dynamic rendering to always load fresh org state (disable caching)
export const dynamic = "force-dynamic";

export default async function OnboardingPage(props: { searchParams?: { checkout?: string } }) {
  try {
    const state = await getOnboardingState();
    
    // Handle checkout success: if checkout=success and plan is active, advance to activation step
    const checkoutSuccess = props.searchParams?.checkout === "success";
    if (checkoutSuccess && state.isPlanActive && state.onboardingStep === 2) {
      // Plan is active after checkout - advance to activation step (step 3)
      // This will be handled by getOnboardingState auto-advance logic
      // Just refresh to get updated state
      const updatedState = await getOnboardingState();
      return <OnboardingClient initialState={updatedState} />;
    }
    
    return <OnboardingClient initialState={state} />;
  } catch (error) {
    // If error is redirect, re-throw it
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    // Otherwise redirect to login
    redirect("/login");
  }
}
