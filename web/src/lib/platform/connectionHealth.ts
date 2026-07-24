/**
 * Connection lifecycle + health (Sprint 7 / R-101, audit C-003).
 *
 * A channel's *capabilities* are static (registry); a **connection's** state is per-org runtime.
 * Before this, a connection was only `connected | coming_soon | disconnected` — so a customer
 * whose Instagram token silently expired got **no signal**, and every future OAuth channel had
 * the same failure mode. The data already existed in the DB (`instagram_connections.
 * token_expires_at / last_error / status`) and was thrown away.
 *
 * Pure + channel-agnostic: any channel that can report {status, expiry, error} gets health for
 * free — no per-channel UI branching.
 */

export type ConnectionState =
  /** Channel exists in the product but this org hasn't connected it. */
  | "not_configured"
  /** Handshake started but not finished (OAuth in flight). */
  | "connecting"
  /** Healthy and receiving. */
  | "connected"
  /** Working, but needs attention soon (e.g. token expiring). */
  | "degraded"
  /** Broken — credentials revoked/expired, or the provider reported an error. */
  | "error"
  /** Deliberately disconnected by the customer. */
  | "disconnected"
  /** Not built yet — truthful placeholder, never implies availability. */
  | "coming_soon";

export type HealthSeverity = "ok" | "warn" | "critical" | "neutral";

export interface ConnectionHealth {
  state: ConnectionState;
  severity: HealthSeverity;
  /** Short, customer-readable status line. */
  label: string;
  /** What's wrong / what to do, when action is needed. */
  detail: string | null;
  /** True when the customer must act (reconnect, fix credentials). */
  actionRequired: boolean;
}

/** Warn this many days before a credential expires. */
export const EXPIRY_WARN_DAYS = 7;

export interface ConnectionHealthInput {
  /** Raw per-channel status string (e.g. instagram_connections.status, phone_lines.status). */
  status?: string | null;
  /** Credential expiry, when the channel has one. */
  expiresAt?: string | null;
  /** Last provider error recorded for this connection. */
  lastError?: string | null;
  /** False when the channel has no adapter yet (declared, unbuilt). */
  adopted?: boolean;
  /** Now, injectable for tests. */
  now?: Date;
}

const CONNECTED_STATUSES = new Set(["connected", "live", "active"]);

export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now.getTime()) / 86_400_000);
}

/**
 * Derive a connection's health. Pure — the same rules for every channel, so a new channel that
 * reports status/expiry/error gets correct health with zero new code.
 */
export function evaluateConnectionHealth(input: ConnectionHealthInput = {}): ConnectionHealth {
  const now = input.now ?? new Date();

  if (input.adopted === false) {
    return {
      state: "coming_soon",
      severity: "neutral",
      label: "Coming soon",
      detail: "This channel isn't available yet.",
      actionRequired: false,
    };
  }

  const raw = (input.status ?? "").toLowerCase().trim();

  if (raw === "connecting" || raw === "pending") {
    return { state: "connecting", severity: "neutral", label: "Connecting…", detail: "Finish the connection to start receiving.", actionRequired: true };
  }

  // An explicit provider error beats everything else.
  if (input.lastError) {
    return {
      state: "error",
      severity: "critical",
      label: "Needs attention",
      detail: input.lastError,
      actionRequired: true,
    };
  }

  if (raw === "disconnected" || raw === "revoked") {
    return { state: "disconnected", severity: "neutral", label: "Disconnected", detail: "Reconnect to start receiving again.", actionRequired: true };
  }

  if (!raw) {
    return { state: "not_configured", severity: "neutral", label: "Not connected", detail: null, actionRequired: false };
  }

  if (CONNECTED_STATUSES.has(raw)) {
    const days = daysUntil(input.expiresAt, now);
    if (days !== null && days < 0) {
      return { state: "error", severity: "critical", label: "Credentials expired", detail: "Reconnect this channel to resume receiving messages.", actionRequired: true };
    }
    if (days !== null && days <= EXPIRY_WARN_DAYS) {
      return {
        state: "degraded",
        severity: "warn",
        label: `Expires in ${days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}`,
        detail: "Reconnect soon to avoid an interruption.",
        actionRequired: true,
      };
    }
    return { state: "connected", severity: "ok", label: "Connected", detail: null, actionRequired: false };
  }

  // Unknown status — surface it rather than pretending it's healthy.
  return { state: "error", severity: "warn", label: "Unknown status", detail: `Reported status: ${raw}`, actionRequired: true };
}
