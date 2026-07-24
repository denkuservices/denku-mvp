import React from "react";
import { Phone, Instagram, MessageCircle, Mail, Smartphone, Globe, Send, MessageSquare } from "lucide-react";
import { channelMeta, type Channel } from "@/lib/platform/channels";

/**
 * Channel pill (icon + label) — the single visual vocabulary for a channel everywhere.
 *
 * Registry-driven (R-099 / audit C-005): the **label comes from the registry**, never duplicated
 * here, and the icon is resolved from the registry's `icon` key through the map below. Adding a
 * channel therefore needs **no edit to this file** — an unmapped icon key falls back to a generic
 * chat glyph rather than breaking the build (which is exactly what the old hardcoded
 * `Record<Channel, …>` maps did).
 */
const ICON_BY_KEY: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  instagram: Instagram,
  whatsapp: MessageCircle,
  telegram: Send,
  email: Mail,
  sms: Smartphone,
  web: Globe,
};

export function channelIcon(channel: Channel): React.ComponentType<{ className?: string }> {
  return ICON_BY_KEY[channelMeta(channel).icon] ?? MessageSquare;
}

export default function ChannelBadge({ channel, className = "" }: { channel: Channel; className?: string }) {
  const meta = channelMeta(channel);
  const Icon = channelIcon(channel);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
