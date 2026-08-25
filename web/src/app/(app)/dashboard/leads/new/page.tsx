import { redirect } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";

/**
 * Adding a contact by hand happens in Customers (Sprint 11).
 *
 * The form and its server action are unchanged — only the surface around them moved, from a route
 * nothing linked to into the hub that owns contacts. Kept as a redirect so the URL still resolves.
 */
export default function NewLeadRedirect() {
  redirect(platformUxEnabled() ? "/dashboard/crm/contacts/new" : "/dashboard/leads");
}
