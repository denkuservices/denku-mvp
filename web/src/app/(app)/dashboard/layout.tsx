import HorizonTopbar from '@/components/horizon-shell/HorizonTopbar';
import { ToastProvider } from '@/components/ui/toast/ToastProvider';

/**
 * Dashboard route group layout.
 * Renders Horizon Free topbar (breadcrumb + title + profile widget capsule)
 * for all /dashboard/* routes, and provides the shared toast system (R-062) so
 * every dashboard mutation can give consistent success/failure feedback.
 *
 * IMPORTANT: This layout ALWAYS renders {children} unconditionally.
 * There is no route filtering - all /dashboard/* routes pass through.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <HorizonTopbar />
      {children}
    </ToastProvider>
  );
}
