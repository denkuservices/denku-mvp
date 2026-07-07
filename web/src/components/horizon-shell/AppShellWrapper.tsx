'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import HorizonShell from './HorizonShell';

/**
 * Conditional wrapper that applies HorizonShell (with sidebar) to dashboard routes.
 *
 * - `/onboarding/*` owns its own full-screen layout → render children directly.
 * - While onboarding is INCOMPLETE, any other app page that is still reachable
 *   (e.g. the billing page, which the middleware allowlists) is rendered inside a
 *   focused, sidebar-less chrome with a single "Back to setup" affordance. This
 *   guarantees the dashboard sidebar never appears — and never abruptly disappears —
 *   during the setup flow, keeping the experience consistent.
 * - Once onboarding is complete, the full dashboard shell (sidebar) is shown.
 */
export default function AppShellWrapper({
  children,
  onboardingComplete = true,
}: {
  children: React.ReactNode;
  onboardingComplete?: boolean;
}) {
  const pathname = usePathname();
  const isOnboarding = pathname?.startsWith('/onboarding') ?? false;

  // Onboarding routes use their own full-screen layout.
  if (isOnboarding) {
    return <>{children}</>;
  }

  // Onboarding still in progress: focused chrome, no dashboard sidebar.
  if (!onboardingComplete) {
    return (
      <div className="brand-surface flex min-h-screen flex-col bg-[#F7F5F1] text-[#0A1A2F]">
        <header className="sticky top-0 z-40 border-b border-[#0A1A2F]/[0.06] bg-[#F7F5F1]/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
            <div className="font-display text-[22px] font-semibold tracking-tight">
              den<span className="text-[#1B6E6E]">ku</span>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-[10px] border border-[#0A1A2F]/10 bg-white px-4 py-2 text-sm font-medium text-[#0A1A2F] transition-all hover:border-[#1B6E6E] hover:text-[#1B6E6E]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to setup
            </Link>
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-5xl px-5 py-8">{children}</div>
        </main>
      </div>
    );
  }

  // Dashboard and other routes use the full shell with sidebar.
  return <HorizonShell>{children}</HorizonShell>;
}
