import { channelMeta, type Channel } from "@/lib/platform/channels";

/**
 * Employee ↔ channel capability model (Sprint 7 / R-104, audit C-007).
 *
 * `EmployeeView.channels` says *which* channels an Employee works; this says *what it can do*
 * on each. Capability is the intersection of two things:
 *   1. what the **channel** supports (registry — e.g. Instagram is receive-only), and
 *   2. what the **Employee** is configured/permitted to do (future per-employee settings).
 *
 * Deriving it (rather than storing it per channel) means a new channel gets a correct capability
 * set the moment it's registered — no per-channel UI branching, which is the sprint's whole point.
 * Pure and channel-agnostic.
 */

export type EmployeeAction =
  /** Receive and understand inbound messages/calls. */
  | "receive"
  /** Send a reply on this channel. */
  | "reply"
  /** Create tickets / appointments from a conversation. */
  | "create_artifacts"
  /** Hand off to a human. */
  | "escalate";

export interface EmployeeChannelCapability {
  channel: Channel;
  actions: EmployeeAction[];
  /** Why an action is unavailable, when it is — shown as helper text, never as a silent gap. */
  limitations: string[];
}

/** Per-employee overrides (future Settings surface). Absent today → channel defaults apply. */
export interface EmployeeCapabilityOverrides {
  /** Explicitly disable replies for this employee even where the channel allows them. */
  replyDisabled?: boolean;
  /** Disable artifact creation (rare; e.g. a read-only observer employee). */
  artifactsDisabled?: boolean;
}

/**
 * What an Employee can do on a channel today. Every channel Denku builds can receive, create
 * artifacts (the never-dead-end guarantee is channel-agnostic) and escalate; replying depends on
 * the channel's `outbound` capability and any employee override.
 */
export function employeeChannelCapability(
  channel: Channel,
  overrides: EmployeeCapabilityOverrides = {}
): EmployeeChannelCapability {
  const meta = channelMeta(channel);
  const actions: EmployeeAction[] = [];
  const limitations: string[] = [];

  if (!meta.adopted) {
    return { channel, actions: [], limitations: [`${meta.label} isn't available yet.`] };
  }

  if (meta.capabilities.inbound) actions.push("receive");

  if (meta.capabilities.outbound && !overrides.replyDisabled) {
    actions.push("reply");
  } else if (!meta.capabilities.outbound) {
    limitations.push(`Denku can receive on ${meta.label} but cannot reply yet.`);
  } else {
    limitations.push("Replies are turned off for this employee.");
  }

  if (!overrides.artifactsDisabled) actions.push("create_artifacts");
  actions.push("escalate");

  return { channel, actions, limitations };
}

export function employeeCan(
  channel: Channel,
  action: EmployeeAction,
  overrides: EmployeeCapabilityOverrides = {}
): boolean {
  return employeeChannelCapability(channel, overrides).actions.includes(action);
}

/** Capabilities across all channels an Employee owns. */
export function employeeCapabilities(
  channels: Channel[],
  overrides: EmployeeCapabilityOverrides = {}
): EmployeeChannelCapability[] {
  return channels.map((c) => employeeChannelCapability(c, overrides));
}
