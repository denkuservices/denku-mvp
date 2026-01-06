import "server-only";

export type TicketsAnalyticsRange = "24h" | "7d" | "30d" | "90d";

export type TicketsAnalyticsParams = {
  range: TicketsAnalyticsRange;
  priority?: "low" | "medium" | "high" | "urgent" | "" | null;
  from?: string; // ISO date string for custom range
  to?: string; // ISO date string for custom range
};

export type TicketsAnalyticsKPIs = {
  createdCount: number;
  closedCount: number;
  openNowCount: number;
  slaBreachedCount: number;
  slaBreachedRate: number; // 0-1
};

export type TicketsAnalyticsFunnel = {
  created: number;
  inProgress: number;
  closed: number;
  createdToInProgressRate: number; // 0-1
  inProgressToClosedRate: number; // 0-1
};

export type TicketsAnalyticsResponseTimes = {
  firstResponseMedianSec: number | null;
  firstResponseP90Sec: number | null;
  timeToCloseMedianSec: number | null;
  timeToCloseP90Sec: number | null;
};

export type TicketsAnalyticsSeries = {
  createdOverTime: Array<{ ts: string; count: number }>;
  priorityBreakdown: Array<{ priority: string; count: number }>;
};

export type TicketsAnalyticsResult = {
  kpis: TicketsAnalyticsKPIs;
  funnel: TicketsAnalyticsFunnel;
  responseTimes: TicketsAnalyticsResponseTimes;
  series: TicketsAnalyticsSeries;
};

