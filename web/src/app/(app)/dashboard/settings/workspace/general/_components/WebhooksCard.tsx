"use client";

import { useState } from "react";
import Link from "next/link";
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
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-base font-semibold text-zinc-900">Webhooks</p>
        <p className="mt-1 text-sm text-zinc-600">
          Inbound events for call reporting and lifecycle tracking.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-zinc-900">Webhook URL</p>
          {hasUrl ? (
            <>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={webhookUrl}
                  className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-mono shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 transition-colors"
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
              <p className="text-xs text-zinc-500">
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
          <p className="text-sm font-semibold text-zinc-900">Subscribed events</p>
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap gap-2">
              {events.map((e) => (
                <span
                  key={e}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-700"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-200">
        <Link
          href="/dashboard/settings/integrations"
          className="text-xs font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          Manage integrations →
        </Link>
      </div>
    </section>
  );
}

