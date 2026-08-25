type RuntimeCardProps = {
  accessLabel: string;
  workspaceStatus: "active" | "paused";
};

/**
 * Workspace runtime facts.
 *
 * This card used to mirror `window.__updateRuntimeWorkspaceStatus` into local state — but its
 * parent (`WorkspaceGeneralContent`) assigns the same global and passes the result down as a prop.
 * React runs child effects before parent ones, so the parent's assignment always overwrote this
 * one and the listener here never fired: dead code that looked like a subscription. The prop is
 * the single source now.
 *
 * Two rows were also dropped. "Environment: Production" is developer context — a customer has no
 * other environment to be in — and "Timezone" repeated the editable field sitting directly above
 * this card on the same page.
 */
export function RuntimeCard({ accessLabel, workspaceStatus }: RuntimeCardProps) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-navy-700 dark:text-white">Runtime</p>
        </div>

      <div className="mt-4 space-y-3">
        <ReadOnlyRow label="Status" value={workspaceStatus === "active" ? "Active" : "Paused"} badge />
        <ReadOnlyRow label="Access" value={accessLabel} badge />
      </div>
    </section>
  );
}

function ReadOnlyRow({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-3">
      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {badge ? (
        <span className="inline-flex rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-3 py-1 text-xs font-semibold text-gray-700 dark:text-gray-200">
          {value}
        </span>
      ) : (
        <span className="text-sm font-semibold text-navy-700 dark:text-white">{value}</span>
      )}
    </div>
  );
}


