import { DM_Sans } from "next/font/google";
import AppShellWrapper from "@/components/horizon-shell/AppShellWrapper";
import HorizonStylesheet from "@/components/horizon-shell/HorizonStylesheet";
import { getOnboardingComplete } from "@/lib/auth/checkOnboarding";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOTE: Do NOT enforce email verification here.
  // - Onboarding uses OTP verification (not email_confirmed_at)
  // - Auth gating is handled server-side in page.tsx components and middleware
  // - Client-side auth checks cannot read httpOnly cookies and should be avoided
  //
  // AppShellWrapper conditionally applies HorizonShell (with sidebar) to dashboard routes,
  // but leaves onboarding routes unwrapped so they can use their own header-only layout.

  // While onboarding is incomplete, the app shell renders a focused, sidebar-less
  // chrome (so the dashboard sidebar never flashes in/out during the setup flow).
  const onboardingComplete = await getOnboardingComplete();

  return (
    <>
      <HorizonStylesheet />
      <div className={`${dmSans.className} w-full`}>
        <AppShellWrapper onboardingComplete={onboardingComplete}>{children}</AppShellWrapper>
      </div>
    </>
  );
}
