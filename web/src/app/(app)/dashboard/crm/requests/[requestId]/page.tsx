import { notFound, redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { resolveActiveOrgId } from "@/lib/platform/serverOrg";
import { getAppointmentDetail } from "@/lib/platform/readModel/requests";
import TicketDetailBody from "./TicketDetailBody";

export const dynamic = "force-dynamic";

/**
 * Request detail — one URL for both artifact types (Sprint 13).
 *
 * Tickets and appointments were one concept split across two tables, and the UI kept that split
 * alive: a legacy shadcn ticket page at `/dashboard/tickets/:id` and an interim appointment route
 * added in Sprint 9. Both now resolve here.
 *
 * The `?type=` hint lets the common case dispatch without probing both tables, but it is a hint,
 * not a trust boundary: the appointment read is org-scoped and returns null for another tenant's
 * id, and an absent or wrong hint just costs one extra lookup before falling through to the
 * ticket body. A guessed id can never confirm someone else's data either way.
 */
export default async function RequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!platformUxEnabled()) notFound();

  const { requestId } = await params;
  const sp = searchParams ? await searchParams : undefined;
  const rawType = Array.isArray(sp?.type) ? sp?.type[0] : sp?.type;

  const orgId = await resolveActiveOrgId();
  if (!orgId) notFound();

  // Appointments are the smaller table and the cheaper probe, so they resolve first whenever the
  // hint does not rule them out.
  if (rawType !== "ticket") {
    const appointment = await getAppointmentDetail(orgId, requestId);
    if (appointment) redirect(`/dashboard/crm/appointments/${requestId}`);
    // Hint said appointment but nothing matched — fall through rather than 404, so a stale link
    // to a request whose type changed still lands on the request.
  }

  return <TicketDetailBody ticketId={requestId} />;
}
