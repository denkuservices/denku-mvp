import { DM_Sans } from "next/font/google";
import { cookies } from "next/headers";
import AppShellWrapper from "@/components/horizon-shell/AppShellWrapper";
import { DashboardLocaleProvider } from "@/components/dashboard-i18n/DashboardLocaleProvider";
import { getOnboardingComplete } from "@/lib/auth/checkOnboarding";
import { platformUxEnabled } from "@/lib/platform/flags";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { getDashboardLocale } from "@/i18n/dashboardLocale.server";
import { GATE_COOKIE_NAME, readGateDecision } from "@/lib/auth/gateCookie";

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

  const jar = await cookies();

  /*
   * While onboarding is incomplete, the app shell renders a focused, sidebar-less chrome (so the
   * dashboard sidebar never flashes in/out during the setup flow).
   *
   * The middleware has usually just established this exact fact one hop earlier and recorded it
   * in the signed gate cookie, so read it from there and skip re-deriving it (perf, 2026-09-04):
   * `getOnboardingComplete()` costs an auth round-trip plus two queries, and it ran on every full
   * page load of the dashboard purely to choose which chrome to draw.
   *
   * The cookie is HMAC-signed and is only ever written after the authoritative check passed, so
   * this cannot be talked into showing chrome to someone mid-setup. Anything else — no cookie
   * (the whole of `/onboarding`), an expired one, an unsigned deployment — falls through to the
   * original check unchanged.
   */
  const gate = await readGateDecision(jar.get(GATE_COOKIE_NAME)?.value);
  const onboardingComplete = gate ? gate.step >= 6 : await getOnboardingComplete();

  // Sprint 5: dark-launch the AI Employees IA behind PLATFORM_UX_ENABLED (default OFF →
  // legacy nav). Resolved server-side; a boolean crosses to the client shell.
  const platformUx = platformUxEnabled();

  // One resolver, shared with the pages that set a browser-tab title. See its own file for why
  // the order matters and why the database is asked last.
  const locale = await getDashboardLocale();

  return (
    <>
      <DashboardLocaleProvider locale={locale} dictionary={getDashboardDictionary(locale)}>
        <div className={`${dmSans.className} w-full`}>
          <AppShellWrapper onboardingComplete={onboardingComplete} platformUx={platformUx}>
            {children}
          </AppShellWrapper>
        </div>
      </DashboardLocaleProvider>
    </>
  );
}
