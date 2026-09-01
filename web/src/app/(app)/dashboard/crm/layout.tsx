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
    <div className="relative isolate">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 -z-10 h-72 bg-[radial-gradient(circle_at_18%_25%,rgba(66,42,251,0.10),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(20,184,166,0.09),transparent_32%)]"
      />
      <CrmTabs />
      <div className="pt-3">{children}</div>
    </div>
  );
}
