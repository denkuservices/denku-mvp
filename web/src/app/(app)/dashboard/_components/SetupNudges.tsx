import Link from "next/link";
import { ArrowRight, BookOpen, MessageSquarePlus } from "lucide-react";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getSetupNudges } from "@/lib/dashboard/setupNudges";

/**
 * Two things a workspace can be paying for and not getting, shown on the dashboard.
 *
 * Rendered above BOTH home variants (the platform one and the legacy one) so the message does
 * not depend on a feature flag the customer has never heard of.
 *
 * Each one states a fact and offers the fix. Neither can be dismissed, because neither appears
 * without a reason and both disappear the moment the reason is gone — a dismiss button here
 * would only let someone hide a bill they are still paying.
 */
export default async function SetupNudges() {
  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    // Not signed in, or no profile yet. The dashboard has its own gating; this just stays quiet.
    return null;
  }
  if (!orgId) return null;

  const nudges = await getSetupNudges(orgId);
  if (nudges.length === 0) return null;

  return (
    <div className="mb-4 space-y-3">
      {nudges.map((n) =>
        n.kind === "knowledge" ? (
          <div
            key={n.kind}
            className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/25 dark:bg-amber-500/10"
          >
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Your AI has answered {n.conversations}{" "}
                  {n.conversations === 1 ? "conversation" : "conversations"} without knowing
                  anything about your business.
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
                  It will not invent an answer, so anything it is not told becomes a ticket for
                  you. Tell it your hours, services and policies and it can answer those itself.
                </p>
              </div>
            </div>
            <Link
              href={n.href}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700 sm:self-auto"
            >
              Add what it should know
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div
            key={n.kind}
            className="flex flex-col gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-brand-400/25 dark:bg-brand-400/10"
          >
            <div className="flex items-start gap-3">
              <MessageSquarePlus className="mt-0.5 h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300" />
              <div>
                <p className="text-sm font-semibold text-navy-700 dark:text-white">
                  You are paying for {n.slots} chat {n.slots === 1 ? "channel" : "channels"} and
                  using {n.connected}.
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                  Connect another channel and your AI answers there too, at no extra cost.
                </p>
              </div>
            </div>
            <Link
              href={n.href}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 sm:self-auto"
            >
              Connect a channel
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )
      )}
    </div>
  );
}
