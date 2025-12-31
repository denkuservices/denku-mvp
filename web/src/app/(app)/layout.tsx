import Link from "next/link";
import DashboardHeader from "@/app/(app)/DashboardHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
