import { ArrowLeft, History } from "lucide-react";
import { Panel, SettingsHero, SettingsLinkButton } from "@/app/(app)/dashboard/_platform/settings/ui";
import SlowLoadNotice from "@/app/(app)/dashboard/_platform/ui/SlowLoadNotice";

/**
 * The audit log while it is being fetched.
 *
 * The page did its work on the server and rendered the word "Loading…" until it finished, which on
 * a workspace with real history was a couple of seconds of a blank surface. A skeleton is not
 * cosmetic here: showing the shape the content will take is the difference between "this is
 * coming" and "this is broken", and it costs one static file.
 *
 * The header is duplicated rather than hoisted into a layout on purpose — it is the part that is
 * instantly knowable, so it should not shift when the data lands.
 */
export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <SettingsHero
        icon={History}
        title="Audit log"
        subtitle="Every settings change, plan change and member action — with what it was before."
        action={
          <SettingsLinkButton href="/dashboard/settings/workspace" variant="secondary">
            <ArrowLeft />
            Back to Workspace
          </SettingsLinkButton>
        }
      />

      <div
        aria-hidden="true"
        className="h-[104px] animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-navy-800"
      />

      <Panel padded={false}>
        <ol className="px-6 py-2" aria-busy="true" aria-label="Loading the audit log">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex gap-4 pb-6 pt-4">
              <span
                aria-hidden="true"
                className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"
              />
              <div className="min-w-0 flex-1 space-y-2">
                <span
                  aria-hidden="true"
                  className="block h-4 w-48 animate-pulse rounded bg-gray-100 dark:bg-white/10"
                />
                <span
                  aria-hidden="true"
                  className="block h-3 w-64 animate-pulse rounded bg-gray-100 dark:bg-white/10"
                />
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <SlowLoadNotice />
    </div>
  );
}
