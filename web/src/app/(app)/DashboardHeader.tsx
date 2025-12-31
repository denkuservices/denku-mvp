import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default function DashboardHeader() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight"
          >
            Denku MVP
          </Link>
          <span className="hidden text-xs text-gray-500 sm:inline">
            Sovereign AI Console
          </span>
        </div>

        {/* Right: Nav */}
        <nav className="flex items-center gap-4">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
