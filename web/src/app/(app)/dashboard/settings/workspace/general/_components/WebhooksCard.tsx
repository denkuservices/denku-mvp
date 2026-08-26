"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  Link2,
  PhoneIncoming,
  PhoneOff,
  Radio,
  Webhook,
} from "lucide-react";
import {
  Notice,
  Panel,
  PanelHeader,
  SettingsButton,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";

type WebhooksCardProps = {
  webhookUrl: string | null;
  events: string[];
};

/** A glyph per event, so the subscription list reads as three states rather than three strings. */
const EVENT_ICONS: Record<string, typeof Radio> = {
  "call-started": PhoneIncoming,
  "call-ended": PhoneOff,
  "end-of-call-report": Radio,
};

/**
 * The call-events endpoint.
 *
 * **Copy note:** this is the URL your telephony provider posts call lifecycle events to — it is
 * Denku's own receiving endpoint, and the description here says exactly that. The previous wording
 * ("use this endpoint to receive events in your backend or automation system") described a
 * capability that does not exist: pointing your own systems at it would send you nothing, because
 * the events are inbound to Denku, not outbound from it. Outbound webhooks are not built.
 */
export function WebhooksCard({ webhookUrl, events }: WebhooksCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const hasUrl = webhookUrl !== null;

  return (
    <Panel>
      <PanelHeader
        icon={Webhook}
        tone="info"
        title="Call events endpoint"
        description="Where your telephony provider delivers call lifecycle events for this workspace."
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 dark:text-white">
            <Link2 aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
            Endpoint URL
          </p>
          {hasUrl ? (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  aria-label="Call events endpoint URL"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5 font-mono text-xs text-navy-700 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                />
                <SettingsButton
                  type="button"
                  variant={copied ? "primary" : "secondary"}
                  onClick={handleCopy}
                  title="Copy to clipboard"
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                  {copied ? "Copied" : "Copy"}
                </SettingsButton>
              </div>
              <p className="text-xs text-gray-500">
                Provisioned automatically. You only need this when a support engineer asks for it.
              </p>
            </>
          ) : (
            <Notice tone="warn" icon={AlertTriangleIcon} title="Application URL is not configured">
              Set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to enable call event
              delivery.
            </Notice>
          )}
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 dark:text-white">
            <Radio aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" />
            Subscribed events
          </p>
          <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200/80 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
            {events.map((e) => (
              <StatusPill key={e} tone="neutral" icon={EVENT_ICONS[e] ?? Radio}>
                <span className="font-mono text-[11px]">{e}</span>
              </StatusPill>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}
