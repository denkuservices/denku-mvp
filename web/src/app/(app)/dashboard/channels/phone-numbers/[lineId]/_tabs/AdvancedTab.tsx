/**
 * ADVANCED TAB — what a phone line can say about itself.
 *
 * Sprint 10 (R-094) emptied this tab of employee configuration. It used to edit
 * `agents.system_prompt_override` through `PATCH /api/phone-lines/[lineId]/update-agent-config`
 * — the same row, through the same server action, as Settings → Agents → Advanced. A phone
 * number is a channel an employee answers on; how that employee behaves belongs to the employee.
 * The capability was not removed, it moved: this tab links to the employee's Setup → Advanced.
 *
 * The "Maximum call duration" and "Silence timeout" inputs were removed in the same change.
 * They had no columns and no update path, and rendered disabled under "Coming soon" beside a
 * field that did save. They are not replaced with invented functionality; the real values are
 * platform-wide constants, not per-line settings.
 */

import Link from "next/link";
import { ArrowUpRight, Settings2 } from "lucide-react";

type LineForAdvanced = {
  id: string;
  status: string | null;
  assigned_agent_id?: string | null;
};

interface AdvancedTabProps {
  line: LineForAdvanced;
}

export function AdvancedTab({ line }: AdvancedTabProps) {
  const employeeId = line.assigned_agent_id ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          How the AI employee on this line behaves
        </h3>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Personality, language, opening line, business knowledge and the system prompt override
          are configured on the AI employee itself — so they stay consistent everywhere it works,
          not just on this number.
        </p>
      </div>

      {employeeId ? (
        <Link
          href={`/dashboard/team/${employeeId}?tab=setup`}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          <Settings2 className="h-4 w-4" />
          Open this employee&apos;s Setup
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : (
        // Honest about the gap rather than rendering a dead button.
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
          No AI employee is assigned to this line yet, so there is nothing to configure. Assign one
          from the{" "}
          <Link href="/dashboard/team" className="font-medium text-brand-600 hover:underline dark:text-brand-300">
            AI Team
          </Link>{" "}
          page.
        </p>
      )}
    </div>
  );
}
