import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { requestHref } from "@/lib/platform/readModel/requests";

/**
 * Ticket detail now resolves as a Request (Sprint 13).
 *
 * The page body moved to the unified detail under Customers → Requests; nothing about status
 * transitions, comments or the activity log changed. Kept as a redirect so every shipped link
 * still lands on the request. Falls back to the legacy list with the platform experience off.
 */
export default async function TicketDetailRedirect({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  redirect(platformUxEnabled() ? requestHref("ticket", ticketId) : "/dashboard/tickets");
}
