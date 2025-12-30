import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="font-semibold">
            SovereignAI
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <Link href="/admin" className="hover:underline">
              Admin
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
