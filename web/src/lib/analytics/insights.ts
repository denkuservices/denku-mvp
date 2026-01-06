import "server-only";
import type { Insight, AnalyticsSummary, OutcomeBreakdownRow, ByAgentRow } from "./types";

/**
 * Compute insights from pre-fetched analytics data (v1.1).
 * This function does NOT query the database - it only processes in-memory data.
 * 
 * Insights are deterministic, actionable, and customer-facing.
 * Max 3 insights shown with priority: cost spike > agent cost > duration > quality.
 */
export function computeInsights({
  currentSummary,
  compareSummary,
  outcomeBreakdown,
  byAgent,
}: {
  currentSummary: AnalyticsSummary;
  compareSummary: AnalyticsSummary;
  outcomeBreakdown: OutcomeBreakdownRow[];
  byAgent: ByAgentRow[];
}): Insight[] {
  const insights: Insight[] = [];

  // If no calls, return empty
  if (currentSummary.totalCalls === 0) {
    return [];
  }

  // 1. Cost Spike Insight (Priority 1)
  // Compare total_cost in current period vs previous same-length period
  // If increase > 50%: severity "warning"
  if (compareSummary.totalCost > 0) {
    const costDelta = ((currentSummary.totalCost - compareSummary.totalCost) / compareSummary.totalCost) * 100;
    if (costDelta > 50) {
      insights.push({
        severity: "warning",
        title: "Cost spike detected",
        description: `Your call costs increased by ${costDelta.toFixed(1)}% compared to the previous period.`,
        metric: "total_cost",
        delta: costDelta,
      });
    }
  }

  // 2. Expensive Agent Outlier (Priority 2)
  // Compute cost_per_call per agent vs global average
  // If any agent > 2x global avg: severity "warning"
  if (byAgent.length > 0 && currentSummary.totalCalls > 0 && currentSummary.totalCost > 0) {
    const globalAvgCostPerCall = currentSummary.totalCost / currentSummary.totalCalls;
    for (const agent of byAgent) {
      if (agent.calls > 0) {
        const agentCostPerCall = agent.cost / agent.calls;
        if (agentCostPerCall > globalAvgCostPerCall * 2) {
          insights.push({
            severity: "warning",
            title: "High cost agent detected",
            description: `${agent.agent_name} has significantly higher cost per call than average.`,
            metric: "Cost per call",
            delta: ((agentCostPerCall - globalAvgCostPerCall) / globalAvgCostPerCall) * 100,
          });
          break; // Only report first outlier
        }
      }
    }
  }

  // 3. Long Duration Agent (Priority 3)
  // Compute avg_duration per agent vs global average
  // If agent avg > global_avg * 1.5: severity "info"
  if (byAgent.length > 0 && currentSummary.avgDuration > 0) {
    for (const agent of byAgent) {
      if (agent.calls > 0 && agent.avgDuration > currentSummary.avgDuration * 1.5) {
        insights.push({
          severity: "info",
          title: "Long call duration",
          description: `${agent.agent_name} has longer than average calls. Review scripts or routing.`,
          metric: "Average duration",
          delta: ((agent.avgDuration - currentSummary.avgDuration) / currentSummary.avgDuration) * 100,
        });
        break; // Only report first outlier
      }
    }
  }

  // 4. High Unclassified Outcome Rate (Priority 4)
  // Compute unclassified_rate = unclassified_calls / total_calls
  // If > 30%: severity "info"
  const unclassifiedRow = outcomeBreakdown.find((r) => r.outcome === "Unclassified");
  const unclassifiedPct = unclassifiedRow ? unclassifiedRow.percentage : 0;
  if (unclassifiedPct > 30) {
    insights.push({
      severity: "info",
      title: "High unclassified call rate",
      description: `More than ${unclassifiedPct.toFixed(1)}% of your calls have no outcome classification. This reduces reporting quality.`,
      metric: "Unclassified calls",
      delta: unclassifiedPct,
    });
  }

  // Limit to max 3 insights (priority order already maintained by rule order)
  return insights.slice(0, 3);
}

