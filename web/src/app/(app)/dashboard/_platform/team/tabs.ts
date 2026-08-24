/**
 * AI Employee detail tabs (Phase 5).
 *
 * The six approved sections. They are query-param tabs on one route rather than nested routes,
 * because every tab reads the same employee — separate routes would refetch it six ways and make
 * "which tab am I on" a routing concern instead of a view concern.
 *
 * Pure, so the vocabulary has one definition shared by the nav, the page and the contract test.
 */

export const EMPLOYEE_TABS = [
  "overview",
  "setup",
  "knowledge",
  "channels",
  "activity",
  "history",
] as const;

export type EmployeeTab = (typeof EMPLOYEE_TABS)[number];

export interface EmployeeTabMeta {
  value: EmployeeTab;
  label: string;
  /** What the tab answers. Used as the section subtitle so no tab is unexplained. */
  description: string;
}

export const EMPLOYEE_TAB_META: Record<EmployeeTab, EmployeeTabMeta> = {
  overview: {
    value: "overview",
    label: "Overview",
    description: "How this employee is doing right now.",
  },
  setup: {
    value: "setup",
    label: "Setup",
    description: "Personality, language and voice — what it is and how it speaks.",
  },
  knowledge: {
    value: "knowledge",
    label: "Knowledge",
    description: "What it knows about your business when it answers.",
  },
  channels: {
    value: "channels",
    label: "Channels",
    description: "Where it works, and what it can do on each one.",
  },
  activity: {
    value: "activity",
    label: "Activity",
    description: "The conversations it has handled.",
  },
  history: {
    value: "history",
    label: "History",
    description: "Every recorded change to this employee's configuration.",
  },
};

export function isEmployeeTab(value: string | null | undefined): value is EmployeeTab {
  return typeof value === "string" && (EMPLOYEE_TABS as readonly string[]).includes(value);
}

/** Resolve a `?tab=` param, defaulting to Overview rather than 404-ing on a bad value. */
export function resolveEmployeeTab(value: string | null | undefined): EmployeeTab {
  return isEmployeeTab(value) ? value : "overview";
}
