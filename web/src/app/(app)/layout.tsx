import AppHeader from "@/app/(app)/_components/layout/AppHeader";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}
