import Link from "next/link";
import DashboardHeader from "@/app/(app)/DashboardHeader";
import { requireVerifiedEmail } from "@/lib/auth/requireVerifiedEmail";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Enforce email verification for all dashboard routes
  await requireVerifiedEmail();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <DashboardHeader />
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}
