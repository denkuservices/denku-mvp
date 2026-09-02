"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Bell, CheckCircle2, Loader2, Mail, Save } from "lucide-react";
import { useToast } from "@/components/ui/toast/ToastProvider";
import { useDashboardLocale } from "@/components/dashboard-i18n/DashboardLocaleProvider";
import {
  FieldLabel,
  INPUT_WITH_ICON_CLASS,
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import { saveNotificationPrefs } from "../../../_actions/notifications";
import { USAGE_ALERT_CHOICES, type NotificationPrefs } from "@/lib/notifications/prefs";

/**
 * What the business hears from Denku, and where.
 *
 * The product had exactly one preference (`notify_on_artifacts`) and it was not on any settings
 * page; usage alerts fired at fixed thresholds to an address the customer could not see. This is
 * the smallest honest version of a notification centre: the three things we actually send, the
 * thresholds we send one of them at, and one address to send them to.
 *
 * The address field is worth its own note — with it empty, mail falls back to the billing address
 * and then to the OWNER's personal inbox. For a business with a bookkeeper that is the wrong
 * human, and the helper text says so instead of leaving them to find out.
 */

/**
 * The values the cron actually evaluates (`lib/billing/usageAlerts.ts`). Offering a threshold
 * nothing checks would be a setting that silently does nothing. 100% is not here because it is not
 * a warning: it pauses the workspace.
 */
const THRESHOLDS = USAGE_ALERT_CHOICES;

/**
 * One preference, as its own component at module scope.
 *
 * It was defined inside `NotificationsCard`, which makes it a NEW component type on every render:
 * React unmounts and remounts the subtree rather than updating it, so the checkbox loses focus the
 * moment anything else on the card changes. Hoisting is the fix, not a style preference.
 */
function PreferenceRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
      />
      <span>
        <span className="block text-sm font-medium text-navy-700 dark:text-white">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

export function NotificationsCard({
  initial,
  canEdit,
}: {
  initial: NotificationPrefs;
  canEdit: boolean;
}) {
  const { success, error: toastError } = useToast();
  const { translate } = useDashboardLocale();
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const toggleThreshold = (value: number) =>
    setPrefs((p) => ({
      ...p,
      usageAlertThresholds: p.usageAlertThresholds.includes(value)
        ? p.usageAlertThresholds.filter((t) => t !== value)
        : [...p.usageAlertThresholds, value].sort((a, b) => a - b),
    }));

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveNotificationPrefs(prefs);
      if (result.ok) {
        setSaved(true);
        success("Notification settings saved.");
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.error);
        toastError(result.error);
      }
    });
  };

  return (
    <Panel>
      <PanelHeader
        icon={Bell}
        title="Notifications"
        description="What we email this workspace about, and where those emails go."
      />

      <div className="mt-5 space-y-5">
        <div className="space-y-4">
          <PreferenceRow
            id="notify-artifacts"
            label="New tickets and booking requests"
            hint="An email when your AI creates something that needs a person — the one notification most businesses want."
            checked={prefs.notifyOnArtifacts}
            disabled={!canEdit || isPending}
            onChange={(v) => set("notifyOnArtifacts", v)}
          />
          <PreferenceRow
            id="notify-usage"
            label="Usage warnings"
            hint="Before you run past the minutes included in your plan and start paying overage."
            checked={prefs.notifyUsageAlerts}
            disabled={!canEdit || isPending}
            onChange={(v) => set("notifyUsageAlerts", v)}
          />
          <PreferenceRow
            id="notify-billing"
            label="Billing and account emails"
            hint="Receipts, failed payments, plan and add-on changes. Payment failures are sent regardless — losing service without warning is worse than an unwanted email."
            checked={prefs.notifyBillingEvents}
            disabled={!canEdit || isPending}
            onChange={(v) => set("notifyBillingEvents", v)}
          />
        </div>

        {prefs.notifyUsageAlerts ? (
          <fieldset className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Warn me at
            </legend>
            <div className="flex flex-wrap gap-4">
              {THRESHOLDS.map((t) => (
                <label key={t} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={prefs.usageAlertThresholds.includes(t)}
                    disabled={!canEdit || isPending}
                    onChange={() => toggleThreshold(t)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                  />
                  <span data-dashboard-no-translate="true">
                    {translate(`${t}% of included minutes`)}
                  </span>
                </label>
              ))}
            </div>
            {prefs.usageAlertThresholds.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nothing selected — you will not be warned before you reach your included minutes.
              </p>
            ) : null}
            <p className="text-xs text-gray-500">
              At 100% the workspace pauses rather than warns, and we always tell you when that
              happens.
            </p>
          </fieldset>
        ) : null}

        <div className="space-y-2">
          <FieldLabel htmlFor="notification-email" icon={Mail}>
            Send these to
          </FieldLabel>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            />
            <input
              id="notification-email"
              type="email"
              value={prefs.notificationEmail ?? ""}
              disabled={!canEdit || isPending}
              onChange={(e) => set("notificationEmail", e.target.value)}
              placeholder="ops@yourbusiness.com"
              className={INPUT_WITH_ICON_CLASS}
            />
          </div>
          <p className="text-xs text-gray-500">
            Leave this empty and we use your billing email, and failing that the workspace
            owner&apos;s personal address — which is often the wrong person.
          </p>
        </div>

        {error ? (
          <Notice tone="critical" icon={AlertCircle}>
            {error}
          </Notice>
        ) : null}
        {saved ? (
          <Notice tone="ok" icon={CheckCircle2}>
            Notification settings saved.
          </Notice>
        ) : null}

        {canEdit ? (
          <div className="flex justify-end">
            <SettingsButton type="button" variant="primary" onClick={save} disabled={isPending}>
              {isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {isPending ? "Saving…" : "Save notifications"}
            </SettingsButton>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            Only owners and admins can change notification settings.
          </p>
        )}
      </div>
    </Panel>
  );
}
