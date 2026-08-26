import React from "react";
import { Phone, Mail, Smartphone, Globe, MessageSquare } from "lucide-react";
import { SiInstagram, SiMessenger, SiWhatsapp, SiTelegram } from "react-icons/si";
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
 * **Two colours, two jobs** (Inbox v2): the *glyph* carries the channel's brand colour always —
 * Instagram is magenta because Instagram is magenta, which claims nothing about whether the
 * customer has connected it — while the *chrome* (background/border) stays neutral for a channel
 * we have not built. So a coming-soon channel is recognisable without becoming the most
 * eye-catching thing on the page, which is what the honesty rule actually asks for.
 */
const ICON_BY_KEY: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  // Brand marks for the channels people recognise by their glyph. A customer scanning an inbox
  // finds Instagram by its logo, not by a camera outline that approximates it — and a generic
  // outline for Messenger or WhatsApp is simply unreadable as that product.
  instagram: SiInstagram,
  messenger: SiMessenger,
  whatsapp: SiWhatsapp,
  telegram: SiTelegram,
  email: Mail,
  sms: Smartphone,
  web: Globe,
};

/**
 * The glyph's own colour, per channel.
 *
 * **Identity, not availability** — and the distinction is the whole point. Instagram's mark is
 * magenta because that is what Instagram is; saying so claims nothing about whether the customer
 * has connected it. Availability is carried by the badge *chrome* below (`channelToneClass`),
 * which stays grey for a channel we have not built, so an unavailable channel still never becomes
 * the loudest thing on the page.
 *
 * Written as full class strings (never interpolated) so Tailwind can see them. Dark-mode variants
 * lift the darker marks off a near-black ground.
 */
const ICON_COLOR: Record<string, string> = {
  voice: "text-teal-600 dark:text-teal-400",
  instagram: "text-[#E1306C] dark:text-[#F06AA0]",
  messenger: "text-[#0084FF] dark:text-[#3FA2FF]",
  whatsapp: "text-[#25D366] dark:text-[#4AE08A]",
  telegram: "text-[#229ED9] dark:text-[#4FB9E8]",
  sms: "text-blue-600 dark:text-blue-400",
  email: "text-amber-600 dark:text-amber-400",
  web: "text-[#0FA37F] dark:text-[#3ECFA8]",
};

/** The brand colour of a channel's glyph — see the note on ICON_COLOR. */
export function channelIconClass(channel: Channel): string {
  return ICON_COLOR[channelMeta(channel).tone] ?? "text-gray-500 dark:text-gray-400";
}

/** Registry tone → badge classes. Unknown tones fall back to neutral. */
const TONE_CLASS: Record<string, string> = {
  voice:
    "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300",
  instagram:
    "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-400/20 dark:bg-pink-400/10 dark:text-pink-300",
  messenger:
    "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-300",
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

export default function ChannelBadge({
  channel,
  compact = false,
  className = "",
}: {
  channel: Channel;
  /**
   * Icon only, no label.
   *
   * For list rows, where the badge sits beside a name that is already the row's subject: the full
   * pill repeated down a column is louder than the content it labels, and the colour alone
   * distinguishes the channels. The label survives as the accessible name, so nothing is lost to
   * a screen reader or to a hover.
   */
  compact?: boolean;
  className?: string;
}) {
  const meta = channelMeta(channel);
  const Icon = channelIcon(channel);

  if (compact) {
    return (
      <span
        title={meta.label}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${channelToneClass(
          channel
        )} ${className}`}
      >
        <Icon className={`h-3 w-3 ${channelIconClass(channel)}`} />
        <span className="sr-only">{meta.label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${channelToneClass(
        channel
      )} ${className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${channelIconClass(channel)}`} />
      {meta.label}
    </span>
  );
}
