import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * Raising a request happens inside Requests (Sprint 13). Form and action unchanged; only the
 * surface moved. Kept as a redirect so the URL still resolves.
 */
export default function NewTicketRedirect() {
  redirect(platformUxEnabled() ? "/dashboard/crm/requests/new" : "/dashboard/tickets");
}
