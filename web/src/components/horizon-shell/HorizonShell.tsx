'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  getActiveNavbar,
  getActiveRoute,
} from './navigation';
import React from 'react';
import SidebarAdapter from './SidebarAdapter';
import { horizonNavRoutes } from './nav';
import { HiMenu } from 'react-icons/hi';

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
    if (typeof window !== 'undefined') {
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
            {/* Minimal Navbar inside main content with offset - matches Horizon structure */}
            <div className="sticky top-0 z-40 flex h-[70px] w-full items-center bg-white/80 px-4 backdrop-blur-sm dark:bg-navy-800/80 md:px-6 lg:px-8">
              <button
                onClick={() => setOpen(!open)}
                className="xl:hidden mr-4 text-gray-600 dark:text-gray-300"
              >
                <HiMenu className="h-6 w-6" />
              </button>
              <h1 className="text-xl font-bold text-navy-700 dark:text-white">
                {brandText}
              </h1>
            </div>
            <div className="mx-auto min-h-screen p-2 !pt-[10px] md:p-2">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
