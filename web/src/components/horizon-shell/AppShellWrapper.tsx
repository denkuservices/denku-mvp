'use client';

import { usePathname } from 'next/navigation';
import HorizonShell from './HorizonShell';

/**
 * Conditional wrapper that applies HorizonShell (with sidebar) to dashboard routes,
 * but renders children directly for onboarding routes (which use their own layout).
 */
export default function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname?.startsWith('/onboarding') ?? false;
  
  // Onboarding routes use their own layout with header only - don't wrap with HorizonShell
  if (isOnboarding) {
    return <>{children}</>;
  }
  
  // Dashboard and other routes use full shell with sidebar
  return <HorizonShell>{children}</HorizonShell>;
}
