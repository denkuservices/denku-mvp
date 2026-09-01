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
  | "messenger"
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
  /**
   * The AI can SEE what a customer photographs here.
   *
   * Separate from `attachments` because the two are genuinely different claims: a channel can
   * carry a file we merely store (`attachments: true`) without anyone being able to read it. This
   * flag is what a surface should check before telling a business "send us a photo of the part" —
   * see `lib/platform/media/understand.ts` for what backs it.
   */
  imageUnderstanding: boolean;
  /** The AI can HEAR a voice note here: it is transcribed and answered as if it had been typed. */
  audioUnderstanding: boolean;
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
  /**
   * Colour key resolved by the UI (keeps Tailwind out of this server-safe module).
   *
   * Colour here is identification, not decoration: in an Inbox where every row carries a channel
   * badge, an all-grey badge makes the channel column unreadable at a glance. The UI deliberately
   * renders this tone ONLY for channels that actually work — a coming-soon channel stays neutral,
   * because brand colour would make an unavailable thing the most eye-catching item on the page.
   */
  tone: string;
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
  // Sight and hearing are shared platform stages, not per-channel features (Sprint 8): any chat
  // channel whose webhook can hand over bytes gets both. So they default ON here for the same
  // reason `attachments` does, and a channel that genuinely cannot carry media turns all three off
  // together — SMS being the one that does.
  imageUnderstanding: true,
  audioUnderstanding: true,
  meteredByMinutes: false,
  ...over,
});

export const CHANNELS: Readonly<Record<Channel, ChannelMeta>> = Object.freeze({
  voice: {
    id: "voice",
    label: "Voice",
    description: "A phone number answered 24/7 by your AI Employee.",
    icon: "phone",
    tone: "voice",
    kind: "voice",
    connection: "provisioned",
    /**
     * Voice perceives nothing here on purpose. A call IS audio, and it is already understood —
     * live, by Vapi's own model inside the call, then transcribed into the conversation. Marking
     * `audioUnderstanding` true would suggest this pipeline touches it, and nothing in
     * `lib/platform/media` runs for a phone call.
     */
    capabilities: {
      inbound: true,
      outbound: true,
      threaded: false,
      attachments: false,
      imageUnderstanding: false,
      audioUnderstanding: false,
      meteredByMinutes: true,
    },
    productionReady: true,
    adopted: true,
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    description: "Receive Instagram direct messages from your business account.",
    icon: "instagram",
    tone: "instagram",
    kind: "chat",
    connection: "oauth",
    // Receive-only by design (Sprint 1.5). Do NOT flip outbound without the reply epic.
    capabilities: chat({ outbound: false }),
    productionReady: false,
    adopted: true,
  },
  messenger: {
    id: "messenger",
    label: "Messenger",
    description: "Answer Facebook Messenger conversations from your Page.",
    icon: "messenger",
    tone: "messenger",
    kind: "chat",
    connection: "oauth",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp",
    description: "Answer WhatsApp Business messages.",
    icon: "whatsapp",
    tone: "whatsapp",
    kind: "chat",
    connection: "oauth",
    capabilities: chat({ outbound: true }),
    productionReady: false,
    adopted: false,
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    description: "Answer Telegram messages on your own bot.",
    icon: "telegram",
    tone: "telegram",
    kind: "chat",
    connection: "credentials",
    // The first channel that both receives AND replies through the shared reply engine.
    // Photos and voice notes are received and understood (Sprint 8); nothing is ever SENT as media.
    capabilities: chat({ outbound: true }),
    /**
     * Flipped 2026-08-27 on evidence, not on the code being finished.
     *
     * A real bot held a real conversation on production and the whole chain was verified in the
     * database afterwards: the message arrived, the AI answered from the business's own hours in
     * the customer's own language, a booking was created and then CORRECTED rather than
     * duplicated, a refund request became a ticket without asking for a name Telegram already
     * gave, and the owner was emailed about both. A person took it over from the Inbox, the AI
     * went quiet, and it resumed when handed back.
     *
     * Known and accepted: a reply that calls a tool currently takes 14-16s (a plain reply is
     * ~3.5s). That is a quality problem, not a correctness one, and it is tracked — see
     * skills/telegram-integration.md.
     */
    productionReady: true,
    adopted: true,
  },
  email: {
    id: "email",
    label: "Email",
    description: "Reply to customer email in a shared inbox.",
    icon: "email",
    tone: "email",
    kind: "chat",
    /**
     * Credentials, not OAuth — decided 2026-08-28.
     *
     * Reading a mailbox through the Gmail API needs a RESTRICTED scope, which means a CASA
     * Tier 2 assessment and an annual re-certification before the first customer can connect.
     * That is the Instagram position again: finished code waiting on someone else's review
     * queue. Instead the customer forwards a published address to one we issue, which works
     * the same way on Gmail, Outlook and any cPanel host and needs no approval from anyone.
     */
    connection: "credentials",
    capabilities: chat({ outbound: true }),
    /**
     * Not production-ready yet: the pipeline exists but no real mail has made the round trip.
     * Flipped only on live evidence, exactly as Telegram was.
     */
    productionReady: false,
    adopted: true,
  },
  sms: {
    id: "sms",
    label: "SMS",
    description: "Answer text messages sent to your number.",
    icon: "sms",
    tone: "sms",
    kind: "chat",
    connection: "provisioned",
    // A text message is text. MMS is a different product with different carrier rules.
    capabilities: chat({
      outbound: true,
      attachments: false,
      imageUnderstanding: false,
      audioUnderstanding: false,
    }),
    productionReady: false,
    adopted: false,
  },
  web: {
    id: "web",
    label: "Web Chat",
    description: "A chat widget on your website, answered by your AI Employee.",
    icon: "web",
    tone: "web",
    kind: "chat",
    connection: "embed",
    /**
     * Attachments are ON as of Sprint 8 — and the note that used to sit here was right that this
     * is a decision rather than a feature. It was taken deliberately: the visitor uploads through
     * a session-token endpoint with an allow-list of formats, a byte ceiling and a per-session
     * count, all in `lib/webchat/uploads.ts`, because a shop's customer photographing the item
     * they are asking about is the most valuable thing this channel could carry.
     */
    capabilities: chat({ outbound: true }),
    /**
     * Not production-ready yet: the channel is built end to end, but nobody has held a real
     * conversation through a widget on a real customer's site. Flipped only on live evidence,
     * exactly as Telegram was — see that entry for what "evidence" meant there.
     */
    productionReady: false,
    adopted: true,
  },
});

/** Stable display order for channel lists (production first, then by build order). */
export const CHANNEL_ORDER: readonly Channel[] = Object.freeze([
  "voice",
  "instagram",
  // Messenger sits beside Instagram: same Meta plumbing, and a business that connects one
  // almost always means to connect the other.
  "messenger",
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
