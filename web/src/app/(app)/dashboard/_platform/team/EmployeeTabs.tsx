import Link from "next/link";
import { EMPLOYEE_TABS, EMPLOYEE_TAB_META, type EmployeeTab } from "./tabs";

/**
 * Employee detail tab rail (Phase 5). Server component — tabs are links, so the page stays
 * server-rendered and each tab is shareable and back-button correct.
 *
 * Same active-state language and brand accent as the CRM hub tabs: one navigation grammar
 * across the product.
 */
export default function EmployeeTabs({
  employeeId,
  active,
}: {
  employeeId: string;
  active: EmployeeTab;
}) {
  return (
    <nav aria-label="Employee sections" className="border-b border-gray-200 dark:border-white/10">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {EMPLOYEE_TABS.map((tab) => {
          const meta = EMPLOYEE_TAB_META[tab];
          const isActive = tab === active;
          return (
            <li key={tab}>
              <Link
                href={`/dashboard/team/${employeeId}${tab === "overview" ? "" : `?tab=${tab}`}`}
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition ${
                  isActive
                    ? "border-brand-500 font-semibold text-brand-600 dark:text-brand-300"
                    : "border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                }`}
              >
                {meta.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
