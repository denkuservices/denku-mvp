/**
 * Placeholder marketing figures — the ONE place invented numbers may live.
 *
 * Why this module exists
 * ----------------------
 * Denku's house rule is that the site never fabricates numbers, and
 * `docs/denku-2.0/20-denku-roadmap.md` makes "fabricate any number" an explicit
 * failure condition for D4 (Website 2.0). The repo has been here before: Sprint 6
 * removed SOC2/HIPAA over-claims that had shipped to production.
 *
 * The owner has approved placeholder figures for the landing rebuild so design work
 * is not blocked on real traction data (decision recorded in
 * `docs/LANDING_V3_DESIGN_PLAN.md` §2). This module is the guard that makes them
 * impossible to ship by accident:
 *
 *   1. Every placeholder figure is declared here, with the real source that must
 *      replace it. Components never hardcode an invented number inline.
 *   2. Every rendered placeholder carries `data-placeholder="true"`, so a launch
 *      check can find them all in the DOM with one selector.
 *   3. `docs/LAUNCH_RUNBOOK.md` carries a blocking item: this registry must be
 *      empty, or every entry replaced with a sourced figure, before launch.
 *
 * Deleting an entry here should break the component that used it. That is the point.
 */

export type PlaceholderMetric = {
  /** Stable id, also emitted as `data-placeholder-id` for launch auditing. */
  id: string;
  /** The figure as displayed. */
  value: string;
  /** The label beside it. */
  label: string;
  /**
   * What must be true before this can ship as a real claim.
   * Never "make it up better" — always a real source or a decision to remove.
   */
  realSource: string;
};

export const PLACEHOLDER_METRICS = {
  callsAnswered: {
    id: "callsAnswered",
    value: "12,400+",
    label: "Calls answered",
    realSource:
      "Aggregate of completed calls from the `calls` table once the demo line and first customers are live (doc 18 W3 — the live truth counter).",
  },
  appointmentsBooked: {
    id: "appointmentsBooked",
    value: "3,100+",
    label: "Appointments booked",
    realSource:
      "Count of appointment artifacts created by the Vapi webhook pipeline; available today, just not yet at a number worth printing.",
  },
  responseTime: {
    id: "responseTime",
    value: "0.8s",
    label: "Average response",
    realSource:
      "Measured from real Vapi call telemetry. NOTE: this one is nearly real — measure it before launch rather than replacing it.",
  },
  businessesServed: {
    id: "businessesServed",
    value: "240+",
    label: "Businesses served",
    realSource:
      "Count of orgs with an active plan. This is the entry most likely to be simply REMOVED rather than replaced — a pre-revenue product should not print a customer count.",
  },
} as const satisfies Record<string, PlaceholderMetric>;

export type PlaceholderMetricId = keyof typeof PLACEHOLDER_METRICS;

/**
 * Spread onto the element that renders a placeholder figure.
 *
 *   <span {...placeholderProps("callsAnswered")}>{PLACEHOLDER_METRICS.callsAnswered.value}</span>
 *
 * Launch audit: `document.querySelectorAll('[data-placeholder="true"]')` must be
 * empty on every marketing route.
 */
export function placeholderProps(id: PlaceholderMetricId) {
  return {
    "data-placeholder": "true",
    "data-placeholder-id": id,
  } as const;
}

/** True while any invented figure is still declared. Read by the launch check. */
export const HAS_PLACEHOLDER_METRICS =
  Object.keys(PLACEHOLDER_METRICS).length > 0;
