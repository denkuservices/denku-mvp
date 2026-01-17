import HorizonTopbar from '@/components/horizon-shell/HorizonTopbar';

/**
 * Dashboard route group layout.
 * Renders Horizon Free topbar (breadcrumb + title + profile widget capsule)
 * for all /dashboard/* routes.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <HorizonTopbar />
      {children}
    </>
  );
}
