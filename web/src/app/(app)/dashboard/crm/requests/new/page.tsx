import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCachedUser } from "@/lib/auth/currentUser";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { NewTicketForm } from "../../../tickets/new/_components/NewTicketForm";
import PageHeader from "../../../_platform/PageHeader";
import { Surface } from "../../../_platform/ui";

export const dynamic = "force-dynamic";

/**
 * Raise a request by hand (Sprint 13).
 *
 * Requests are normally created by the AI from a conversation, so this is the exception — but it
 * lived at `/dashboard/tickets/new`, outside the hub that owns them. The form and its server
 * action are reused unchanged; only the surface around them moved.
 */
export default async function NewRequestPage() {
  if (!platformUxEnabled()) notFound();

  const auth = { user: await getCachedUser() };
  const userId = auth?.user?.id;
  if (!userId) redirect("/login");

  const orgId = await resolveActiveOrgId();
  if (!orgId) redirect("/dashboard/crm/requests");

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/requests"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Requests
      </Link>

      <PageHeader
        title="New request"
        subtitle="Most requests are created by your AI team from a conversation. Use this to log one yourself."
      />

      <div className="max-w-3xl">
        <Surface>
          <NewTicketForm orgId={orgId} userId={userId} />
        </Surface>
      </div>
    </div>
  );
}
