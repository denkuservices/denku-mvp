'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { isWindowAvailable } from '@/horizon/utils/navigation';
import {
  getActiveNavbar,
  getActiveRoute,
} from './navigation';
import React from 'react';
import SidebarAdapter from './SidebarAdapter';
import Navbar from '@/horizon/components/navbar';
import Footer from '@/horizon/components/footer/Footer';
import { horizonNavRoutes } from './nav';

interface HorizonShellProps {
  children: React.ReactNode;
}

/**
 * HorizonShell - Adapter component that wraps app routes with Horizon UI layout shell
 * (sidebar + topbar + spacing + background) while preserving existing page logic.
 */
export default function HorizonShell({ children }: HorizonShellProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  
  // Compute brandText and secondary only on client to avoid hydration mismatch
  // Use stable initial values that match server render
  const [brandText, setBrandText] = useState<string>('Dashboard');
  const [secondary, setSecondary] = useState(false);

  // Update brandText and secondary after mount and when pathname changes
  useEffect(() => {
    setBrandText(getActiveRoute(horizonNavRoutes, pathname));
    setSecondary(getActiveNavbar(horizonNavRoutes, pathname));
  }, [pathname]);

  // Set document direction (LTR) if window is available
  useEffect(() => {
    if (isWindowAvailable()) {
      document.documentElement.dir = 'ltr';
    }
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background-100 dark:bg-background-900">
      <SidebarAdapter routes={horizonNavRoutes} open={open} setOpen={setOpen} variant="admin" />
      {/* Main Content Column - This is the scroll container */}
      <div className="flex min-h-screen flex-1 flex-col min-w-0 h-full w-full font-dm dark:bg-navy-900">
        {/* Scrollable main content area - matches Horizon layout structure */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden mx-2.5 transition-all dark:bg-navy-900 md:pr-2 xl:ml-[323px]">
          {/* Routes wrapper - matches Horizon structure */}
          <div>
            {/* Navbar inside main content with offset - matches Horizon structure */}
            <Navbar
              onOpenSidenav={() => setOpen(!open)}
              brandText={brandText}
              secondary={secondary}
            />
            <div className="mx-auto min-h-screen p-2 !pt-[10px] md:p-2">
              {children}
            </div>
            <div className="p-3">
              <Footer />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
