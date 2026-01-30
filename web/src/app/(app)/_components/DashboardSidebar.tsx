"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Phone,
  UserPlus,
  Ticket,
  BarChart3,
  Settings,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/phone-lines", label: "Phone Lines", icon: Phone },
  { href: "/dashboard/calls", label: "Calls", icon: Phone },
  { href: "/dashboard/leads", label: "Leads", icon: UserPlus },
  { href: "/dashboard/tickets", label: "Tickets", icon: Ticket },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-card">
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-base font-semibold text-foreground hover:text-foreground/80 transition-colors"
          >
            <span>Denku MVP</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "text-blue-600 font-medium"
                        : "text-gray-500 font-normal hover:bg-gray-100/50"
                    )}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-blue-600"
                        aria-hidden="true"
                      />
                    )}
                    <Icon 
                      className="h-4 w-4 shrink-0 text-inherit" 
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

