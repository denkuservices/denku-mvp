import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Plug } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import type { ConnectionHealth } from "@/lib/platform/connectionHealth";
import type { ChannelView } from "@/lib/platform/readModel/types";
import ChannelBadge from "../ChannelBadge";
import { Surface, Pill } from "../ui";

/**
 * Generic channel card (Sprint 7 / R-103). ONE component renders every channel in every
 * lifecycle state — connected, degraded (credentials expiring), error, disconnected, or
 * coming-soon — driven entirely by the registry + `ConnectionHealth`. A new channel gets a
 * correct card with no code here.
 *
 * Honesty rules baked in: an unbuilt channel renders a **disabled** "Coming soon" affordance and
 * never a Connect button; a non-production channel is labelled Experimental.
 */

/** Where a channel's existing management UI lives, until generic connect flows are built. */
const MANAGE_HREF: Partial<Record<Channel, (v: ChannelView) => string>> = {
  voice: (v) =>
    v.connectionId
      ? `/dashboard/channels/phone-numbers/${v.connectionId}`
      : "/dashboard/channels/phone-numbers",
  instagram: () => "/dashboard/channels/instagram",
  telegram: () => "/dashboard/channels/telegram",
  email: () => "/dashboard/channels/email",
};

function HealthLine({ health }: { health: ConnectionHealth }) {
  if (health.severity === "neutral" && !health.detail) return null;
  const Icon =
    health.severity === "ok" ? CheckCircle2 : health.severity === "warn" ? Clock : health.severity === "critical" ? AlertTriangle : Plug;
  const tone =
    health.severity === "ok"
      ? "text-green-600 dark:text-green-400"
      : health.severity === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : health.severity === "critical"
          ? "text-red-600 dark:text-red-400"
          : "text-gray-500";
  return (
    <div className={`flex items-start gap-1.5 text-xs ${tone}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">
        {health.label}
        {health.detail ? <span className="block text-gray-500 dark:text-gray-400">{health.detail}</span> : null}
      </span>
    </div>
  );
}

export default function ChannelCard({ view }: { view: ChannelView }) {
  const meta = channelMeta(view.channel);
  const health = (view.meta?.health as ConnectionHealth | undefined) ?? {
    state: "not_configured",
    severity: "neutral",
    label: "Not connected",
    detail: null,
    actionRequired: false,
  };
  const isComingSoon = health.state === "coming_soon";
  const isConnected = health.state === "connected" || health.state === "degraded";
  const manage = MANAGE_HREF[view.channel]?.(view);

  return (
    <Surface className={`h-full ${isComingSoon ? "opacity-75" : ""}`}>
      <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <ChannelBadge channel={view.channel} />
        {!meta.productionReady && !isComingSoon ? <Pill tone="warn">Experimental</Pill> : null}
      </div>

      <div className="min-w-0 flex-1">
        {/* The badge above already names the channel. Repeating it here printed "WhatsApp
            WhatsApp" on every unconnected card — so this line is the connection's own identity
            (a phone number, an @handle) or nothing at all. */}
        {view.identifier ? (
          <p className="truncate text-sm font-medium text-navy-700 dark:text-white">{view.identifier}</p>
        ) : null}
        <p className={`text-xs text-gray-500 ${view.identifier ? "mt-0.5" : ""}`}>{meta.description}</p>
      </div>

      {/* A coming-soon card already says so on its disabled button; the health line would be the
          third time the same two words appear on one card. */}
      {isComingSoon ? null : <HealthLine health={health} />}

      <div className="mt-auto pt-1">
        {isComingSoon ? (
          <button
            type="button"
            disabled
            title={`${meta.label} isn't available yet`}
            className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-navy-800"
          >
            Coming soon
          </button>
        ) : manage ? (
          <Link
            href={manage}
            className="inline-flex w-full items-center justify-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5"
          >
            {/* When the connection exists but no employee owns it, the job isn't "manage" — it's
                the one thing standing between this channel and answering a customer. */}
            {health.code === "unassigned"
              ? "Assign an employee"
              : isConnected
                ? "Manage"
                : health.actionRequired
                  ? "Reconnect"
                  : "Connect"}
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Connection flow not available yet"
            className="w-full cursor-not-allowed rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400 dark:border-white/10 dark:bg-navy-800"
          >
            Connect
          </button>
        )}
      </div>
      </div>
    </Surface>
  );
}