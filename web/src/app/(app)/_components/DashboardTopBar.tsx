import { AccountMenu } from "@/app/(app)/AccountMenu";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { SITE_NAME } from "@/config/site";

export async function DashboardTopBar() {
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
    <header className="sticky top-0 z-30 h-16 border-b border-border bg-card">
      <div className="flex h-full items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{SITE_NAME} Console</span>
        </div>
        <AccountMenu 
          userEmail={userEmail}
          userName={userName}
          orgName={orgName}
          userRole={userRole}
        />
      </div>
    </header>
  );
}

