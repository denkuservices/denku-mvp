import type { Channel } from "@/lib/platform/channels";

/**
 * Platform Read Model — view types (Sprint 5, P0).
 *
 * A stable, platform-shaped read interface that the new IA (Employees · Conversations ·
 * Contacts · Channels) renders. It is deliberately DECOUPLED from storage: today the read
 * model sources these views from existing legacy tables (`calls`, `agents`, `phone_lines`,
 * `instagram_connections`, `leads`) so the UI shows real data regardless of
 * `PLATFORM_MODEL_ENABLED`; when the read-cutover (R-085) lands, the sources swap to
 * `conversations`/`contacts`/`employee_channels` with NO change to these types or the UI.
 *
 * Two design invariants (owner requirements):
 *  1. **Employees own Channels** — `EmployeeView.channels` is the ownership edge; the model
 *     is never channel-resource-centric.
 *  2. **Channel-tagged for plugin rendering** — every `ConversationView`/`ConversationTurn`
 *     carries its `channel`, so the conversation thread UI dispatches to a per-channel
 *     renderer via a registry (no core change to add WhatsApp/Email/SMS/WebChat later).
 */

export interface ContactRef {
  /** contacts.id / leads.id when resolvable, else null. */
  id: string | null;
  displayName: string | null;
  /** channel-native handle (phone E.164, IG username/id). */
  handle: string | null;
}

export type ArtifactType = "ticket" | "appointment";

export interface ArtifactRef {
  id: string;
  type: ArtifactType;
  status: string | null;
  title: string | null;
}

export type TurnRole = "user" | "assistant" | "system";
export type TurnDirection = "inbound" | "outbound";

/**
 * One file a customer sent, ready to render.
 *
 * The description or transcript is NOT here — it is part of `content`, because that is what every
 * reader already reads (see `lib/platform/media/understand.ts`). This carries only what the text
 * cannot: the original, behind a short-lived signed URL, so the owner can look at the photo their
 * AI described rather than take its word for it.
 */
export interface TurnAttachment {
  kind: "image" | "audio" | "video" | "file";
  filename: string | null;
  mime: string | null;
  /** How perception handled it — an unread file must not look like a read one. */
  status: string;
  /** Signed, expiring, and null when no copy was kept. */
  url: string | null;
}

export interface ConversationTurn {
  id: string;
  channel: Channel;
  role: TurnRole;
  direction: TurnDirection | null;
  content: string;
  at: string | null; // ISO
  /** Attachments on this message. Absent on every turn that had none. */
  media?: TurnAttachment[];
}

export interface ConversationView {
  /** Stable id — the call id (voice) or conversation id (chat). */
  id: string;
  channel: Channel;
  employeeId: string | null;
  employeeName: string | null;
  contact: ContactRef;
  /** open | closed | completed | … (channel-normalized). */
  status: string | null;
  intent: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  /** short preview line for the inbox. */
  summary: string | null;
  /** channel-specific extras a renderer may use (e.g. duration_seconds for voice). */
  meta: Record<string, unknown>;
  /** provenance — which store this came from (read-cutover awareness). */
  source: "calls" | "conversations";
}

export interface ConversationDetailView extends ConversationView {
  turns: ConversationTurn[];
  artifacts: ArtifactRef[];
}

export type ChannelStatus = "connected" | "coming_soon" | "disconnected";

export interface ChannelView {
  channel: Channel;
  label: string;
  kind: "voice" | "chat";
  productionReady: boolean;
  status: ChannelStatus;
  /** channel-native connection id (phone_lines.id / instagram_connections.id), if any. */
  connectionId: string | null;
  /** human identifier (phone number / IG username). */
  identifier: string | null;
  /**
   * The AI Employee that owns this connection, when the channel supports assignment.
   *
   * Lifted out of `meta` because it is not decoration: it is the difference between a channel
   * that answers customers and one that only exists. It used to be reachable only for `voice`,
   * which happened to list its owner column in `metaColumns` — so a surface offering to assign
   * an employee worked on phone lines and silently did nothing on Telegram, email or web chat.
   * The registry already names the column for all four; this makes the value travel with the view.
   */
  assignedTo: string | null;
  meta: Record<string, unknown>;
}

export interface EmployeeView {
  id: string; // agents.id
  name: string;
  language: string | null;
  voice: string | null;
  status: string | null;
  /** Employees OWN channels — the ownership edge (design invariant #1). */
  channels: ChannelView[];
  vapiAssistantId: string | null;
}
