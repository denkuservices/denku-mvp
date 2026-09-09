/**
 * Why a workspace is paused — and, more importantly, which of those reasons stop the phones.
 *
 * The union itself was written out by hand in twenty-one places, which is survivable. What was not
 * survivable is that ONE of those places also made a decision with it: `enforcePause.ts` asks
 * `pausedReason === "hard_cap" || "past_due" || "manual"` before it will unbind a number, so a
 * reason that exists in the database but is missing from that list reads as "not really paused" and
 * the workspace keeps answering calls. Adding `trial_ended` without noticing that line would have
 * shipped a trial that pauses in the dashboard and bills in reality.
 *
 * So the decision lives here, once, and the enumeration is the thing that is asserted rather than
 * remembered. Pure — no imports — so a client badge can read it too.
 */

export const PAUSED_REASONS = ["manual", "hard_cap", "past_due", "trial_ended"] as const;
export type PausedReason = (typeof PAUSED_REASONS)[number];

export function isPausedReason(value: unknown): value is PausedReason {
  return typeof value === "string" && (PAUSED_REASONS as readonly string[]).includes(value);
}

/**
 * Does this pause actually take the telephony down?
 *
 * Every reason does. It is written as a function rather than assumed, because the failure it
 * guards against is silent: a workspace shown as paused whose Vapi numbers are still bound keeps
 * answering, and the operator finds out from the invoice. An unrecognised reason counts as paused —
 * fail-closed, which for the money side is the direction the house rule asks for.
 */
export function pauseBlocksTelephony(reason: string | null | undefined): boolean {
  return Boolean(reason);
}

/**
 * Can the customer lift this pause themselves?
 *
 * No for the two billing reasons — those need a payment, and letting the customer resume would
 * hand back the capacity the cap took away. Yes for `manual`, which they chose. Yes for
 * `trial_ended`, deliberately: the pause is not a punishment and the workspace has no bill to
 * settle, so the customer resuming just means their phone rings again with no minutes granted —
 * and the next call re-pauses them. Blocking it would strand a trial workspace with no self-serve
 * way out, which is worse for the very customer the trial was meant to convert.
 */
export function customerMayResume(reason: string | null | undefined): boolean {
  return reason !== "hard_cap" && reason !== "past_due";
}
