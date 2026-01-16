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
    
    // getOnboardingState() already performs self-heal: if plan is active and step < 3,
    // it sets step=3 in DB. We rely on that deterministic behavior.
    // Do NOT write onboarding_step here to avoid race with client polling.
    
    // If plan is active and step >= 4, redirect to dashboard (onboarding complete)
    // But allow step 3 to proceed (activation)
    if (state.isPlanActive && state.onboardingStep >= 4) {
      redirect("/dashboard");
    }
    
    // Pass checkout status to client for UI handling (no server-side writes)
    const checkoutStatus = checkoutParam === "success" ? "success" : checkoutParam === "cancel" ? "cancel" : null;
    return <OnboardingClient initialState={state} checkoutStatus={checkoutStatus} />;
  } catch (error) {
    // If error is redirect, re-throw it
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    // Otherwise redirect to login
    redirect("/login");
  }
}
