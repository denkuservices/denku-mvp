import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NewLeadForm } from "./_components/NewLeadForm";

export const dynamic = "force-dynamic";

async function resolveOrgId() {
  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!auth?.user) throw new Error("Not authenticated. Please sign in to view this dashboard.");

  const profileId = auth.user.id;
  const candidates = ["org_id", "organization_id", "current_org_id", "orgs_id"] as const;

  for (const col of candidates) {
    const { data, error } = await supabase
      .from("profiles")
      .select(`${col}`)
      .eq("id", profileId)
      .maybeSingle();

    if (!error && data && (data as any)[col]) {
      return (data as any)[col] as string;
    }
  }

  throw new Error(
    "Could not resolve org_id for this user. Expected one of: profiles.org_id / organization_id / current_org_id / orgs_id."
  );
}

export default async function NewLeadPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;

  if (!userId) {
    redirect("/dashboard/leads");
  }

  const orgId = await resolveOrgId();

  return (
    <div className="p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/leads" className="text-sm text-muted-foreground hover:underline">
            Leads
          </Link>
          <span className="text-sm text-muted-foreground">/</span>
          <h1 className="text-2xl font-semibold tracking-tight">New Lead</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Create a new lead</p>
      </div>

      <div className="!z-5 relative flex flex-col rounded-[20px] bg-white bg-clip-border shadow-shadow-100 dark:!bg-navy-800 dark:text-white dark:shadow-none">
        <div className="px-6 pt-6">
          <h2 className="font-dm text-lg font-bold text-navy-700 dark:text-white">Lead Information</h2>
        </div>
        <div className="mt-4 px-6 pb-6">
          <NewLeadForm orgId={orgId} userId={userId} />
        </div>
      </div>
    </div>
  );
}
