"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isProfile = pathname === "/dashboard/settings/account/profile";
  const isSecurity = pathname === "/dashboard/settings/account/security";

  return (
    <div className="p-6 space-y-6">
      {/* Back button */}
      <Link href="/dashboard/settings">
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </Link>

      {/* Header with tabs */}
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 shadow-sm">
        {/* Breadcrumb */}
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <span className="text-zinc-400">/</span>
          <Link href="/dashboard/settings" className="hover:underline">
            Settings
          </Link>
          <span className="text-zinc-400">/</span>
          <span className="text-foreground font-medium">Account</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your personal account settings.</p>

        {/* Tabs */}
        <div className="mt-6 flex gap-1 border-b border-zinc-200">
          <TabLink 
            href="/dashboard/settings/account/profile" 
            label="Profile" 
            isActive={isProfile}
          />
          <TabLink 
            href="/dashboard/settings/account/security" 
            label="Security" 
            isActive={isSecurity}
          />
        </div>
      </div>

      {/* Page content */}
      <main>{children}</main>
    </div>
  );
}

function TabLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      className={`relative -mb-px px-4 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "text-foreground border-b-2 border-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}
