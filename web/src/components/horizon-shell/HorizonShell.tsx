'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import React from 'react';
import SidebarAdapter from './SidebarAdapter';
import { horizonNavRoutes, platformNavRoutes } from './nav';
import { MobileNavProvider, useMobileNav } from './MobileNavContext';

interface HorizonShellProps {
  children: React.ReactNode;
  /**
   * When true (PLATFORM_UX_ENABLED, resolved server-side and passed down), render the
   * AI Employees platform navigation; otherwise the legacy voice-first nav. A boolean —
   * never JSX — crosses the server/client boundary.
   */
  platformUx?: boolean;
}

/**
 * HorizonShell - Adapter component that wraps app routes with Horizon UI layout shell
 * (sidebar + topbar + spacing + background) while preserving existing page logic.
 */
function HorizonShellInner({ children, platformUx = false }: HorizonShellProps) {
  const { mobileNavOpen, setMobileNavOpen } = useMobileNav();
  const pathname = usePathname();

  const navRoutes = platformUx ? platformNavRoutes : horizonNavRoutes;

  /**
   * The Inbox is the one route that is a *surface*, not a page of cards: it wants the whole
   * area between the sidebar and the right edge, with only the profile/theme capsule above it.
   * So for `/dashboard/inbox` the content wrapper drops its reading-width cap and its side
   * padding — the sidebar and the topbar stay exactly where they are.
   */
  const fullBleed = (pathname ?? '').startsWith('/dashboard/inbox');

  // Close mobile drawer when route changes (mobile only)
  // Only depend on pathname - don't include mobileNavOpen to avoid closing when opening
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Set document direction (LTR) if window is available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.dir = 'ltr';
    }
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background-100 dark:bg-background-900">
      {/* Skip-to-content link (R-070) — first focusable element; visible only on keyboard focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Skip to main content
      </a>
      <SidebarAdapter routes={navRoutes} open={mobileNavOpen} setOpen={setMobileNavOpen} variant="admin" />
      {/* Main Content Column - This is the scroll container */}
      <div className="flex min-h-screen flex-1 flex-col min-w-0 h-full w-full font-dm dark:bg-navy-900">
        {/* Scrollable main content area - matches Horizon layout structure */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mx-2.5 transition-all dark:bg-navy-900 md:pr-2 xl:ml-[323px] relative focus:outline-none">
          {/* Routes wrapper - matches Horizon structure */}
          <div>
            {/* Old mobile hamburger removed - now in ProfileWidget */}
            <div
              className={`mx-auto !pt-[10px] ${
                fullBleed ? 'w-full max-w-none' : 'min-h-screen max-w-7xl px-4 md:px-6'
              }`}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function HorizonShell({ children, platformUx = false }: HorizonShellProps) {
  return (
    <MobileNavProvider>
      <HorizonShellInner platformUx={platformUx}>{children}</HorizonShellInner>
    </MobileNavProvider>
  );
}
