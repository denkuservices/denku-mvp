import Link from "next/link";
import { AlertTriangle, UserPlus } from "lucide-react";

/**
 * "Nobody is going to answer this" — said on the channel's own page, before the customer finds out
 * from a silent widget.
 *
 * The Channels *list* already surfaces this through `evaluateConnectionHealth` ("No employee
 * assigned" + an Assign button). What it could not cover is the state a brand-new workspace is
 * actually in: **zero employees**. With none to choose from, every connect form simply hid its
 * employee picker, so the page said nothing at all — and the first sign of trouble was a customer
 * message that never got a reply. That is the same class of failure as a phone line live in Vapi
 * and assigned to nobody: the channel is plumbed, and nobody is on the other end.
 *
 * Two states, two different remedies, which is why this is not one generic sentence:
 *   - **no employees at all** → the fix is to create one, and the link goes there;
 *   - **employees exist, none assigned** → the fix is the picker already on this page.
 *
 * Renders nothing when an employee is assigned. Shared by every channel page so a new channel
 * inherits the warning by importing it, not by remembering to re-describe the problem.
 */
export default function EmployeeAssignmentNotice({
  employeeCount,
  assignedAgentId,
  channelLabel,
  /** False before the channel is connected — the wording shifts from "isn't" to "won't be". */
  connected = true,
}: {
  employeeCount: number;
  assignedAgentId: string | null;
  channelLabel: string;
  connected?: boolean;
}) {
  if (assignedAgentId) return null;

  if (employeeCount === 0) {
    return (
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <p className="flex items-start gap-2 font-medium">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>This workspace has no AI Employee yet.</span>
        </p>
        <p className="mt-1.5 pl-6">
          {connected
            ? `Messages arriving on ${channelLabel} are recorded in your Inbox, but nothing answers them.`
            : `Once ${channelLabel} is connected, messages will be recorded in your Inbox, but nothing will answer them.`}{" "}
          Create an employee first — it takes a minute.
        </p>
        <Link
          href="/dashboard/team/new"
          className="mt-3 ml-6 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-amber-700"
        >
          <UserPlus className="h-3.5 w-3.5" />
          Create an AI Employee
        </Link>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <p className="flex items-start gap-2">
        <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <span className="font-medium">No AI Employee is assigned to {channelLabel}.</span>{" "}
          {connected
            ? "Customers reaching this channel are not answered until you choose one below."
            : "Choose one when you connect it, or customers reaching this channel will not be answered."}
        </span>
      </p>
    </div>
  );
}
