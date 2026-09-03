/**
 * What a customer keeps after they drop an add-on, and until when.
 *
 * The policy, decided 2026-09-03: **dropping an add-on is never a refund.** The month is already
 * paid for, so the capacity stays until that period ends and then simply does not renew. What the
 * customer gets instead of money back is a date, said plainly, before they confirm.
 *
 * Before this file, dropping one did the opposite twice over — Stripe's default proration credited
 * the unused days back, and the row flipped to `inactive` the same second, so the capacity vanished
 * on day two of a month they had paid in full.
 *
 * Pure on purpose. Every rule here is a date comparison or an arithmetic one, and money rules that
 * live inside a route handler are money rules nobody can test. The route does IO; this decides.
 */

/** The row shape both `getEffectiveLimits` and the billing summary read. */
export interface AddonRowLike {
  qty: number | string | null;
  status: string | null;
  /** When a scheduled downgrade takes effect. Null means nothing is scheduled. */
  ends_at?: string | null;
  /** What `qty` becomes at `ends_at`. Null means nothing is scheduled. */
  scheduled_qty?: number | string | null;
}

/**
 * Add-ons this policy applies to.
 *
 * Deliberately NOT the chat tiers. `chat_basic` and `chat_standard` are mutually exclusive and the
 * purchase route refuses one while the other is `active` — so keeping a dropped tier alive until
 * the period ends would make switching tiers impossible for up to a month. Voice capacity has no
 * such exclusion: an extra number or an extra concurrent call is just a number that goes down.
 */
export const SCHEDULABLE_ADDON_KEYS = ["extra_phone", "extra_concurrency"] as const;
export type SchedulableAddonKey = (typeof SCHEDULABLE_ADDON_KEYS)[number];

export function isSchedulableAddon(key: string): key is SchedulableAddonKey {
  return (SCHEDULABLE_ADDON_KEYS as readonly string[]).includes(key);
}

function toInt(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * How much of this add-on the workspace is entitled to **right now**.
 *
 * The date is enforced HERE rather than by the sweep, and that is the whole safety argument: the
 * only scheduled job in this product runs monthly, Stripe periods are not calendar-aligned, and a
 * workspace must not keep capacity it stopped paying for merely because a cron has not run yet.
 * The sweep tidies rows; this decides entitlement.
 */
export function effectiveAddonQty(row: AddonRowLike | null | undefined, now: Date = new Date()): number {
  if (!row) return 0;
  if ((row.status ?? "") !== "active") return 0;

  const endsAt = row.ends_at ? Date.parse(row.ends_at) : NaN;
  if (Number.isFinite(endsAt) && endsAt <= now.getTime()) {
    // The period they paid for is over: the scheduled quantity is what is left. A schedule with no
    // target quantity means the add-on was dropped entirely.
    return Math.max(0, toInt(row.scheduled_qty, 0));
  }

  return Math.max(0, toInt(row.qty, 0));
}

/** Is a downgrade booked and still in the future? Used for the "active until …" notice. */
export function pendingDowngrade(
  row: AddonRowLike | null | undefined,
  now: Date = new Date()
): { endsAt: string; qtyAfter: number } | null {
  if (!row || (row.status ?? "") !== "active" || !row.ends_at) return null;
  const endsAt = Date.parse(row.ends_at);
  if (!Number.isFinite(endsAt) || endsAt <= now.getTime()) return null;
  return { endsAt: row.ends_at, qtyAfter: Math.max(0, toInt(row.scheduled_qty, 0)) };
}

export type AddonChangePlan =
  | {
      /** Nothing to do — the requested quantity is what they already have. */
      kind: "noop";
      qty: number;
    }
  | {
      /** More capacity, charged the way it always was: Stripe prorates the increase. */
      kind: "increase";
      qty: number;
      /** An increase cancels any pending downgrade — they changed their mind. */
      clearsSchedule: boolean;
    }
  | {
      /** Less capacity, kept until the paid period ends. */
      kind: "scheduled_decrease";
      /** Unchanged: what they keep until `endsAt`. */
      keepQty: number;
      /** What it becomes then. */
      scheduledQty: number;
      endsAt: string;
    }
  | {
      /**
       * Less capacity, applied immediately — the pre-policy behaviour, kept for add-ons the policy
       * does not cover (the mutually-exclusive chat tiers) and for the case where we could not
       * learn when the paid period ends. Never guess a date at a customer: without one there is
       * nothing honest to promise, so the old behaviour is the safer of two imperfect options.
       */
      kind: "immediate_decrease";
      qty: number;
      reason: "not_schedulable" | "no_period_end";
    };

/**
 * Decide what a requested quantity change means.
 *
 * `periodEnd` is the Stripe subscription's `current_period_end` — the moment the money they have
 * already handed over stops covering anything.
 */
export function planAddonChange(input: {
  addonKey: string;
  currentQty: number;
  requestedQty: number;
  periodEnd: Date | null;
  now?: Date;
}): AddonChangePlan {
  const current = Math.max(0, toInt(input.currentQty, 0));
  const requested = Math.max(0, toInt(input.requestedQty, 0));

  if (requested === current) return { kind: "noop", qty: current };
  if (requested > current) return { kind: "increase", qty: requested, clearsSchedule: true };

  if (!isSchedulableAddon(input.addonKey)) {
    return { kind: "immediate_decrease", qty: requested, reason: "not_schedulable" };
  }

  const now = input.now ?? new Date();
  const end = input.periodEnd;
  if (!end || !Number.isFinite(end.getTime()) || end.getTime() <= now.getTime()) {
    return { kind: "immediate_decrease", qty: requested, reason: "no_period_end" };
  }

  return {
    kind: "scheduled_decrease",
    keepQty: current,
    scheduledQty: requested,
    endsAt: end.toISOString(),
  };
}

/**
 * Would this decrease leave a phone line nobody is paying for?
 *
 * A line is the business's published front door. Nothing in this codebase may delete one to make
 * the books balance, so the only honest moment to refuse is BEFORE the slot is given up — while
 * the owner is still looking at the screen and can delete a line themselves.
 *
 * `linesInUse` is counted at the moment of the request. The phone-line delete path calls the same
 * route to give a slot back and passes `releasingLines: 1`, because the line it is deleting is
 * still in the table when it asks.
 */
export function phoneDowngradeBlocked(input: {
  basePhones: number;
  requestedExtraPhones: number;
  linesInUse: number;
  releasingLines?: number;
}): { blocked: boolean; linesAfter: number; slotsAfter: number } {
  const slotsAfter = Math.max(0, toInt(input.basePhones, 0)) + Math.max(0, toInt(input.requestedExtraPhones, 0));
  const linesAfter = Math.max(0, toInt(input.linesInUse, 0) - Math.max(0, toInt(input.releasingLines, 0)));
  return { blocked: linesAfter > slotsAfter, linesAfter, slotsAfter };
}
