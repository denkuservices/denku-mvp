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
 * The ⚠️ note that used to sit here recorded a disagreement — the runtime registry
 * had Email at `productionReady: false` while this file called it live — and asked
 * an engineer to flip the registry deliberately if Email really was ready. That
 * happened on 2026-09-03, and Web chat moved to `live` the same day after the owner
 * ran the snippet on minosandco.com and the AI answered a real visitor. Registry and
 * marketing now agree on every row, which is the state this file is supposed to be
 * in. If they ever diverge again, write the note back rather than picking a side
 * quietly.
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
    // Live since 2026-09-03: the snippet was embedded on a real third-party site
    // (minosandco.com) and the AI answered a visitor there. It is a chat channel like
    // Telegram and email, so it counts against a chat plan's channel allowance.
    id: "webchat",
    label: "Web chat",
    line: "A widget on your site.",
    status: "live",
    statusLabel: "Live",
  },
];

export const LIVE_CHANNELS = MARKETING_CHANNELS.filter((c) => c.status === "live");
export const BETA_CHANNELS = MARKETING_CHANNELS.filter((c) => c.status === "beta");
