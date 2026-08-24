import { redirect, notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import { CRM_DEFAULT_HREF } from "../_platform/crm/nav";

export const dynamic = "force-dynamic";

/**
 * CRM hub index. Contacts is the hub's centre of gravity — every other CRM view is reached
 * through a person — so `/dashboard/crm` sends you there rather than rendering a landing page
 * that would only duplicate the tabs above it.
 */
export default async function CrmIndexPage() {
  if (!platformUxEnabled()) notFound();
  redirect(CRM_DEFAULT_HREF);
}
