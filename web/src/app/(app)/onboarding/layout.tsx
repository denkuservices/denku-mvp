import HorizonTopbar from '@/components/horizon-shell/HorizonTopbar';

/**
 * Onboarding route group layout.
 * Renders Horizon Free topbar (breadcrumb + title + profile widget capsule)
 * for all /onboarding routes.
 * Note: Sidebar is NOT rendered here - AppShellWrapper in (app)/layout.tsx
 * bypasses HorizonShell for onboarding routes, allowing this header-only layout.
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background-100 dark:bg-background-900">
      <div className="flex min-h-screen flex-1 flex-col min-w-0 h-full w-full font-dm dark:bg-navy-900">
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mx-2.5 transition-all dark:bg-navy-900 md:pr-2 relative">
          <div className="mx-auto min-h-screen max-w-7xl px-4 !pt-[10px] md:px-6">
            <HorizonTopbar />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
