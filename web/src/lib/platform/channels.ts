/**
 * Platform channel registry (Sprint 4.5 — Platform Foundation).
 *
 * The single source of truth for "what channels exist" — the DB deliberately stores
 * `channel` as free text (no enum) so a new channel needs code, not a migration. Add a
 * channel here and the platform model (conversations, employee_channels, contacts,
 * artifacts) accepts it with zero schema change.
 *
 * `productionReady` gates marketing/UX honesty: only Voice is production-ready today;
 * Instagram is experimental (receive-only); the rest are declared-but-unbuilt so the
 * model can be reasoned about without over-claiming. NEVER surface a non-production
 * channel as available in customer-facing copy.
 *
 * See docs/audits/AI_EMPLOYEES_PLATFORM_AUDIT.md.
 */

export type Channel =
  | "voice"
  | "instagram"
  | "web"
  | "whatsapp"
  | "email"
  | "sms";

export type ChannelKind = "voice" | "chat";

export interface ChannelMeta {
  /** Stable identifier stored in DB `channel` columns. */
  id: Channel;
  /** Customer-facing label. */
  label: string;
  /** Interaction shape — voice (audio turns) vs chat (text messages). */
  kind: ChannelKind;
  /** True only for channels safe to sell/rely on today. */
  productionReady: boolean;
  /** True for channels wired into the shared model (adapter exists). */
  adopted: boolean;
}

export const CHANNELS: Readonly<Record<Channel, ChannelMeta>> = Object.freeze({
  voice: { id: "voice", label: "Voice", kind: "voice", productionReady: true, adopted: true },
  instagram: { id: "instagram", label: "Instagram", kind: "chat", productionReady: false, adopted: true },
  web: { id: "web", label: "Web Chat", kind: "chat", productionReady: false, adopted: false },
  whatsapp: { id: "whatsapp", label: "WhatsApp", kind: "chat", productionReady: false, adopted: false },
  email: { id: "email", label: "Email", kind: "chat", productionReady: false, adopted: false },
  sms: { id: "sms", label: "SMS", kind: "chat", productionReady: false, adopted: false },
});

export const ALL_CHANNELS: readonly Channel[] = Object.freeze(
  Object.keys(CHANNELS) as Channel[]
);

export function isKnownChannel(value: unknown): value is Channel {
  return typeof value === "string" && value in CHANNELS;
}

export function channelMeta(channel: Channel): ChannelMeta {
  return CHANNELS[channel];
}

/** Channels that have a shared-model adapter and can be relied on to write conversations. */
export function adoptedChannels(): Channel[] {
  return ALL_CHANNELS.filter((c) => CHANNELS[c].adopted);
}

/** Channels safe to present to customers as available today. */
export function productionChannels(): Channel[] {
  return ALL_CHANNELS.filter((c) => CHANNELS[c].productionReady);
}
