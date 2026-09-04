import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCachedUser } from "@/lib/auth/currentUser";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { NewLeadForm } from "../../../leads/new/_components/NewLeadForm";
import PageHeader from "../../../_platform/PageHeader";
import { Surface } from "../../../_platform/ui";

export const dynamic = "force-dynamic";

/**
 * Add a contact by hand (Sprint 11).
 *
 * Contacts are normally created by the AI when someone gets in touch, so this is the exception
 * rather than the main path — but it existed only at `/dashboard/leads/new`, a route nothing in
 * the platform IA linked to. Capability preserved, given a home people can find.
 *
 * Reuses the existing form and its server action unchanged; only the surface around it is new.
 */
export default async function NewContactPage() {
  if (!platformUxEnabled()) notFound();

  const auth = { user: await getCachedUser() };
  const userId = auth?.user?.id;
  if (!userId) redirect("/login");

  const orgId = await resolveActiveOrgId();
  if (!orgId) redirect("/dashboard/crm/contacts");

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/crm/contacts"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Contacts
      </Link>

      <PageHeader
        title="Add a contact"
        subtitle="Most contacts are created automatically when someone calls or messages. Use this when you already know who they are."
      />

      <Surface>
        <NewLeadForm orgId={orgId} userId={userId} />
      </Surface>
    </div>
  );
}
