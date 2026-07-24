/**
 * Platform channel registry (Sprint 4.5; capability + lifecycle model added Sprint 7).
 *
 * **The single source of truth for everything a channel is.** The DB stores `channel` as free
 * text (no enum) on purpose: adding a channel is code, not a migration. Adding an entry here —
 * plus an adapter, a connection table, and a credentials route — is the WHOLE job. No UI file
 * should ever need editing to add a channel; `test/channel-contract.test.ts` enforces that.
 *
 * Three things live here, and each exists because a UI decision would otherwise be hardcoded:
 *   1. **Identity**   — id, label, icon key, kind. (Labels/icons are read from here, never
 *                        duplicated in components — R-099/C-005.)
 *   2. **Capability**  — how it connects and what it can do, so surfaces can decide *generically*
 *                        whether to show Connect vs Manage, a reply box, minutes vs messages
 *                        (R-100/C-002).
 *   3. **Readiness**   — productionReady (may we sell it?) and adopted (is there an adapter?).
 *                        Never surface a non-production channel as available (honesty rule).
 *
 * Connection *lifecycle* (per-org runtime state: connected/degraded/error…) is NOT here — that's
 * per-connection, modelled in `lib/platform/connectionHealth.ts` (R-101).
 */

export type Channel =
  | "voice"
  | "instagram"
  | "whatsapp"
  | "telegram"
  | "email"
  | "sms"
  | "web";

export type ChannelKind = "voice" | "chat";

/** How an org connects this channel — drives which connect affordance a surface renders. */
export type ConnectionMethod =
  /** Provisioned by Denku (buy/assign a phone number). */
  | "provisioned"
  /** Third-party OAuth handshake (Meta, Google…). */
  | "oauth"
  /** Operator/customer pastes API credentials or a token. */
  | "credentials"
  /** Nothing to connect — embed a snippet / always-on. */
  | "embed";

/** What the channel can carry — lets surfaces decide features without per-channel branching. */
export interface ChannelCapabilities {
  /** Can Denku receive on this channel? (Every channel we build does.) */
  inbound: boolean;
  /** Can Denku SEND on this channel today? Instagram is receive-only — must stay false. */
  outbound: boolean;
  /** Conversations are long-lived threads (chat) vs. a single session (a call). */
  threaded: boolean;
  /** Media/attachments are meaningful on this channel. */
  attachments: boolean;
  /** Usage is metered in minutes (voice) rather than messages — billing dimension (R-086). */
  meteredByMinutes: boolean;
}

export interface ChannelMeta {
  /** Stable identifier stored in DB `channel` columns. */
  id: Channel;
  /** Customer-facing label — the ONLY place this string is defined. */
  label: string;
  /** One-line description for connect/coming-soon cards. */
  description: string;
  /** Icon key resolved by the UI icon map (keeps lucide out of this server-safe module). */
  icon: string;
  kind: ChannelKind;
  connection: ConnectionMethod;
  capabilities: ChannelCapabilities;
  /** True only for channels safe to sell/rely on today. */
  productionReady: boolean;
  /** True for channels wired into the shared model (an adapter exists). */
  adopted: boolean;
}

const chat = (over: Partial<ChannelCapabilities> = {}): ChannelCapabilities => ({
  inbound: true,
  outbound: false,
  threaded: true,
  attachments: true,
  meteredByMinutes: false,
  ...over,
});

export const CHANNELS: Readonly<Record<Channel, ChannelMeta>> = Object.freeze({
  voice: {
    id: "voice",
    label: "Voice",
    description: "A phone number answered 24/7 by your AI Employee.",
    icon: "phone",
    kind: "voice",
    connection: "provisioned",
    capabilities: { inbound: true, outbound: true, threaded: false, attachments: false, meteredByMinutes: true },
    productionReady: true,
    adopted: true,
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    description: "Receive Instagram direct messages from your business account.",
    icon: "instagram",
    kind: "chat",
    connection: "oauth",
    // Receive-only by design (Sprint 1.5). Do NOT flip outbound without the reply epic.
    capabilities: chat({ outbound: false }),
    productionReady: false,
    adopted: true,
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Answer WhatsApp Business messages.",
    icon: "whatsapp",
    kind: "chat",
    connection: "oauth",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    description: "Answer Telegram messages via a bot.",
    icon: "telegram",
    kind: "chat",
    connection: "credentials",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
  email: {
    id: "email",
    label: "Email",
    description: "Reply to customer email in a shared inbox.",
    icon: "email",
    kind: "chat",
    connection: "oauth",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
  sms: {
    id: "sms",
    label: "SMS",
    description: "Answer text messages sent to your number.",
    icon: "sms",
    kind: "chat",
    connection: "provisioned",
    capabilities: chat({ outbound: true, attachments: false }),
    productionReady: false,
    adopted: false,
  },
  web: {
    id: "web",
    label: "Web Chat",
    description: "A chat widget on your website.",
    icon: "web",
    kind: "chat",
    connection: "embed",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
});

/** Stable display order for channel lists (production first, then by build order). */
export const CHANNEL_ORDER: readonly Channel[] = Object.freeze([
  "voice",
  "instagram",
  "whatsapp",
  "telegram",
  "email",
  "sms",
  "web",
]);

export const ALL_CHANNELS: readonly Channel[] = CHANNEL_ORDER;

export function isKnownChannel(value: unknown): value is Channel {
  return typeof value === "string" && value in CHANNELS;
}

export function channelMeta(channel: Channel): ChannelMeta {
  return CHANNELS[channel];
}

/** Channels that have a shared-model adapter and can be relied on to write conversations. */
export function adoptedChannels(): Channel[] {
  return CHANNEL_ORDER.filter((c) => CHANNELS[c].adopted);
}

/** Channels safe to present to customers as available today. */
export function productionChannels(): Channel[] {
  return CHANNEL_ORDER.filter((c) => CHANNELS[c].productionReady);
}

/** Declared-but-unbuilt channels — rendered as truthful "coming soon" affordances. */
export function comingSoonChannels(): Channel[] {
  return CHANNEL_ORDER.filter((c) => !CHANNELS[c].adopted);
}

/** Channels a customer can actually see/filter by today (has an adapter). */
export function selectableChannels(): Channel[] {
  return adoptedChannels();
}
