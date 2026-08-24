import React from "react";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import CrmTabs from "../_platform/crm/CrmTabs";

/**
 * CRM hub layout (Phase 2).
 *
 * Renders the section tabs once for every CRM route, so Contacts and Requests read as two
 * views of one customer relationship rather than two unrelated tables. Each child page keeps
 * its own header, loading and error states.
 *
 * Gated here as well as in each page: a layout alone cannot 404, but checking at both levels
 * means a future CRM route added without its own guard still cannot leak while the flag is off.
 */
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  if (!platformUxEnabled()) notFound();

  return (
    <div>
      <CrmTabs />
      <div className="pt-6">{children}</div>
    </div>
  );
}
