/**
 * How channels are PRESENTED on the marketing site.
 *
 * Deliberately separate from `lib/platform/channels.ts`, which is the runtime
 * registry that gates product behaviour. The two answer different questions:
 * the registry answers "may the app route traffic here?", this answers "what may
 * the website say about it?". Keeping them apart means a marketing decision can
 * never accidentally switch on a channel in the product.
 *
 * Owner decision 2026-08-29: Voice, Telegram and Email are presented as live;
 * Instagram as receive-only; the rest carry a Beta badge and are not purchasable.
 *
 * ⚠️ One known disagreement: the runtime registry still has Email at
 * `productionReady: false`. The owner states it is working. That flag is left
 * alone — flipping it would change product gating on the strength of a marketing
 * decision. If Email really is production-ready, an engineer should flip it in the
 * registry deliberately, and this note should come out.
 */

export type ChannelStatus = "live" | "limited" | "beta";

export type MarketingChannel = {
  id: string;
  label: string;
  /** What it does, in the customer's words. Six words or fewer. */
  line: string;
  status: ChannelStatus;
  /** Shown on the badge. */
  statusLabel: string;
  /** Only for `limited` and `beta` — the honest caveat, spelled out. */
  caveat?: string;
};

export const STATUS_ORDER: Record<ChannelStatus, number> = {
  live: 0,
  limited: 1,
  beta: 2,
};

export const MARKETING_CHANNELS: MarketingChannel[] = [
  {
    id: "voice",
    label: "Voice",
    line: "Answers your phone line.",
    status: "live",
    statusLabel: "Live",
  },
  {
    id: "telegram",
    label: "Telegram",
    line: "Replies in your own bot.",
    status: "live",
    statusLabel: "Live",
  },
  {
    id: "email",
    label: "Email",
    line: "Answers forwarded mail.",
    status: "live",
    statusLabel: "Live",
  },
  {
    id: "instagram",
    label: "Instagram",
    line: "Receives your DMs.",
    status: "limited",
    statusLabel: "Receiving",
    caveat: "Messages arrive in your Inbox. Replying from Denku is not switched on yet.",
  },
  {
    id: "messenger",
    label: "Messenger",
    line: "Facebook page messages.",
    status: "beta",
    statusLabel: "Beta",
    caveat: "Not included in any plan yet.",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    line: "Business messaging.",
    status: "beta",
    statusLabel: "Beta",
    caveat: "Not included in any plan yet.",
  },
  {
    id: "sms",
    label: "SMS",
    line: "Texts back missed calls.",
    status: "beta",
    statusLabel: "Beta",
    caveat: "Not included in any plan yet.",
  },
  {
    id: "webchat",
    label: "Web chat",
    line: "A widget on your site.",
    status: "beta",
    statusLabel: "Beta",
    caveat: "Not included in any plan yet.",
  },
];

export const LIVE_CHANNELS = MARKETING_CHANNELS.filter((c) => c.status === "live");
export const BETA_CHANNELS = MARKETING_CHANNELS.filter((c) => c.status === "beta");
