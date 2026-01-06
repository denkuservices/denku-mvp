export type AnalyticsRange = "7d" | "30d" | "90d";

export type AnalyticsSummary = {
  totalCalls: number;
  totalCost: number;
  avgDuration: number;
  leadsCount: number;
  ticketsCount: number;
  appointmentsCount: number;
  estimatedSavings: number; // Estimated savings vs human agents ($25/hour)
};

export type DailyTrendRow = {
  date: string; // YYYY-MM-DD
  calls: number;
  avgDuration: number;
  cost: number;
};

export type ByAgentRow = {
  agent_id: string | null;
  agent_name: string;
  calls: number;
  avgDuration: number;
  cost: number;
};

export type OutcomeBreakdownRow = {
  outcome: string;
  calls: number;
  percentage: number;
};

export type Insight = {
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  metric?: string;
  delta?: number;
};

export type AnalyticsParams = {
  range: AnalyticsRange;
  agentId?: string;
  outcome?: string;
  direction?: string;
  section?: "calls" | "tickets";
  priority?: "low" | "medium" | "high" | "urgent" | "";
};

