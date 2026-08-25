"use client";

import { useState } from "react";
import { CopyIcon, CheckIcon, AlertTriangleIcon } from "lucide-react";

type WebhooksCardProps = {
  webhookUrl: string | null;
  events: string[];
};

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
    <section className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-navy-700 dark:text-white">Webhooks</p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Inbound events for call reporting and lifecycle tracking.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy-700 dark:text-white">Webhook URL</p>
          {hasUrl ? (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-3 text-sm font-mono shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-4 py-3 text-sm font-semibold text-navy-700 dark:text-white shadow-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="h-4 w-4 text-green-600" />
                      <span className="text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="h-4 w-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Use this endpoint to receive real-time call lifecycle events from Denku in your
                backend or automation system.
              </p>
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangleIcon className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">
                    Application URL is not configured
                  </p>
                  <p className="mt-1 text-xs text-amber-800">
                    Set <span className="font-mono">NEXT_PUBLIC_APP_URL</span> to enable webhooks.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-navy-700 dark:text-white">Subscribed events</p>
          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-4">
            <div className="flex flex-wrap gap-2">
              {events.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-navy-800 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

