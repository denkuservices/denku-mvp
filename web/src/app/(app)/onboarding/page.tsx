import { redirect } from "next/navigation";
import { getOnboardingState } from "./_actions";
import { OnboardingClient } from "./OnboardingClient";

export default async function OnboardingPage() {
  try {
    const state = await getOnboardingState();
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
