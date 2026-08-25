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
 *
 * **Colour is identification, not decoration.** Every badge used to be the same grey, which made
 * the channel column of the Inbox unreadable at a glance — the one place a customer needs to tell
 * a phone call from an Instagram DM without reading. Tones come from the registry and resolve
 * here, so Tailwind stays out of the server-safe module.
 *
 * A channel that does not work yet stays **neutral on purpose**: brand colour on a coming-soon
 * card would make the unavailable thing the most eye-catching item on the page, which is the
 * opposite of what the honesty rule asks for.
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

/** Registry tone → badge classes. Unknown tones fall back to neutral. */
const TONE_CLASS: Record<string, string> = {
  voice:
    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300",
  instagram:
    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-300",
  whatsapp:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-400/20 dark:bg-green-400/10 dark:text-green-300",
  telegram:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
  sms: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
  email:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
  web: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
};

const NEUTRAL_CLASS =
  "border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200";

export function channelIcon(channel: Channel): React.ComponentType<{ className?: string }> {
  return ICON_BY_KEY[channelMeta(channel).icon] ?? MessageSquare;
}

/** The badge classes for a channel — neutral unless the channel actually works. */
export function channelToneClass(channel: Channel): string {
  const meta = channelMeta(channel);
  if (!meta.adopted) return NEUTRAL_CLASS;
  return TONE_CLASS[meta.tone] ?? NEUTRAL_CLASS;
}

export default function ChannelBadge({ channel, className = "" }: { channel: Channel; className?: string }) {
  const meta = channelMeta(channel);
  const Icon = channelIcon(channel);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${channelToneClass(
        channel
      )} ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}
