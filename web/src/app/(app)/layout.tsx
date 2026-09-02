import { DM_Sans } from "next/font/google";
import { cookies } from "next/headers";
import AppShellWrapper from "@/components/horizon-shell/AppShellWrapper";
import { DashboardLocaleProvider } from "@/components/dashboard-i18n/DashboardLocaleProvider";
import { getOnboardingComplete } from "@/lib/auth/checkOnboarding";
import { platformUxEnabled } from "@/lib/platform/flags";
import { getDashboardDictionary } from "@/i18n/dashboardMessages";
import { routing, type Locale } from "@/i18n/routing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  // Sprint 5: dark-launch the AI Employees IA behind PLATFORM_UX_ENABLED (default OFF →
  // legacy nav). Resolved server-side; a boolean crosses to the client shell.
  const platformUx = platformUxEnabled();

  const cookieLocale = (await cookies()).get("NEXT_LOCALE")?.value;
  let locale: Locale = routing.locales.includes(cookieLocale as Locale)
    ? (cookieLocale as Locale)
    : routing.defaultLocale;

  // The cookie gives an instant same-device response; the profile is the cross-device source of
  // truth and is also what transactional email uses.
  if (!cookieLocale) {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("ui_locale")
        .eq("auth_user_id", user.id)
        .limit(1)
        .maybeSingle<{ ui_locale: string | null }>();
      if (routing.locales.includes(profile?.ui_locale as Locale)) {
        locale = profile?.ui_locale as Locale;
      }
    }
  }

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
