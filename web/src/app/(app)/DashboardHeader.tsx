import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import { DashboardNav } from "./_components/DashboardNav";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WorkspaceStatusBadgeClient } from "@/components/workspace/WorkspaceStatusBadgeClient";

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
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Left: Brand + Status */}
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm font-semibold tracking-tight text-foreground hover:text-foreground/80 transition-colors"
          >
            Denku MVP
          </Link>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Sovereign AI Console
          </span>
          {/* Workspace status badge - only shows when paused */}
          <WorkspaceStatusBadgeClient className="hidden sm:inline-flex" />
        </div>

        {/* Right: Nav + Account */}
        <div className="flex items-center gap-6">
          <DashboardNav />
          <div className="h-5 w-px bg-border" />
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
