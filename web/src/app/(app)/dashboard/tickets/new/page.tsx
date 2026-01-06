import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveOrgId } from "@/lib/analytics/params";
import { isAdminOrOwner } from "@/lib/analytics/params";
import { createTicket } from "@/lib/tickets/actions";
import { NewTicketForm } from "./_components/NewTicketForm";

export const dynamic = "force-dynamic";

export default async function NewTicketPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;

  if (!userId) {
    redirect("/dashboard/tickets");
  }

  const orgId = await resolveOrgId();
  const canCreate = await isAdminOrOwner(orgId, userId);

  if (!canCreate) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-900">You don't have permission to create tickets.</p>
          <p className="text-xs text-red-700 mt-1">Only owners and admins can create tickets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New Ticket</h1>
        <p className="text-sm text-muted-foreground mt-1">Create a new support ticket</p>
      </div>

      <NewTicketForm orgId={orgId} userId={userId} />
    </div>
  );
}

