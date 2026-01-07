import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NavItem = {
  href: string;
  label: string;
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/calls", label: "Calls" },
  { href: "/dashboard/leads", label: "Leads" },
  { href: "/dashboard/tickets", label: "Tickets" },
  { href: "/dashboard/analytics", label: "Analytics" },
  { href: "/dashboard/settings", label: "Settings" },
];

export default async function DashboardHeader() {
  // Fetch user data for AccountMenu (minimal query)
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userEmail = auth?.user?.email ?? null;
  
  let userName: string | null = null;
  let orgName: string | null = null;
  let userRole: string | null = null;
  
  if (auth?.user?.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, org_id, role")
      .eq("id", auth.user.id)
      .maybeSingle();
    
    userName = profile?.full_name ?? null;
    userRole = profile?.role ?? null;
    
    if (profile?.org_id) {
      const { data: org } = await supabase
        .from("orgs")
        .select("name")
        .eq("id", profile.org_id)
        .maybeSingle();
      
      orgName = org?.name ?? null;
    }
  }
  
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

        {/* Right: Nav + Account */}
        <div className="flex items-center gap-4">
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
          <AccountMenu 
            userEmail={userEmail}
            userName={userName}
            orgName={orgName}
            userRole={userRole}
          />
        </div>
      </div>
    </header>
  );
}
