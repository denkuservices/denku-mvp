import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseAnalyticsParams, getDateRange, resolveOrgId, assertAdminOrOwner } from "@/lib/analytics/params";
import {
  fetchCalls,
  fetchAgents,
  computeSummary,
  computeDailyTrend,
  computeByAgent,
  computeOutcomeBreakdown,
} from "@/lib/analytics/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ExportParamsSchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).default("7d"),
  agentId: z.string().uuid().optional(),
  outcome: z.string().optional(),
  direction: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    // 1) Parse and validate params
    const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = ExportParamsSchema.safeParse(searchParams);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const params = parsed.data;

    // 2) Resolve orgId and verify auth (Supabase session, NOT Basic Auth)
    const orgId = await resolveOrgId();
    const supabase = await createSupabaseServerClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      // Return JSON error WITHOUT WWW-Authenticate header to avoid browser Basic Auth prompt
      return NextResponse.json({ error: "Unauthorized: Please log in" }, {
        status: 401,
        headers: {
          // Explicitly do NOT include WWW-Authenticate header
        },
      });
    }

    // 3) Enforce role gate (admin/owner only)
    // Use try/catch to return proper 403 without WWW-Authenticate header
    try {
      await assertAdminOrOwner(orgId, auth.user.id);
    } catch (err) {
      // Return 403 JSON error WITHOUT WWW-Authenticate header
      const errorMessage = err instanceof Error ? err.message : "Forbidden";
      return NextResponse.json({ error: "forbidden" }, {
        status: 403,
        headers: {
          // Explicitly do NOT include WWW-Authenticate header
        },
      });
    }

    // 4) Get date range
    const { from, to } = getDateRange(params.range);

    // 5) Fetch data (calls and agents - all computation is in-memory)
    const [calls, agents] = await Promise.all([
      fetchCalls({
        orgId,
        from,
        to,
        agentId: params.agentId,
        outcome: params.outcome,
        direction: params.direction,
      }),
      fetchAgents(orgId), // Fetch agents for lookup map
    ]);

    // Build agent name lookup map (agent_id -> agent_name)
    const agentNameById: Record<string, string> = {};
    for (const agent of agents) {
      if (agent.id && agent.name) {
        agentNameById[agent.id] = agent.name;
      }
    }

    // 6) Compute all analytics from fetched data (no additional queries)
    // Agent names resolved from agents table lookup with fallback to raw_payload
    // Adaptive bucketing: day for 7d/30d, week for 90d
    const bucket: "day" | "week" = params.range === "90d" ? "week" : "day";
    const summary = computeSummary(calls, 0, 0, 0); // Counts not needed for export, but needed for estimatedSavings
    const dailyTrend = computeDailyTrend(calls, from, to, bucket);
    const byAgent = computeByAgent(calls, agentNameById);
    const outcomeBreakdown = computeOutcomeBreakdown(calls);

    // 7) Generate CSV
    const csvLines: string[] = [];

    // Section 0: Summary (including estimated savings)
    csvLines.push("metric,value");
    csvLines.push(`Estimated Savings (USD),${summary.estimatedSavings.toFixed(2)}`);
    csvLines.push("");

    // Section 1: Daily trend
    csvLines.push("date,calls,avg_duration_seconds,cost_usd");
    for (const row of dailyTrend) {
      csvLines.push(`${row.date},${row.calls},${row.avgDuration.toFixed(2)},${row.cost.toFixed(4)}`);
    }

    // Blank line separator
    csvLines.push("");

    // Section 2: By agent
    csvLines.push("agent,agent_id,calls,avg_duration_seconds,cost_usd");
    for (const row of byAgent) {
      csvLines.push(
        `"${row.agent_name}",${row.agent_id || ""},${row.calls},${row.avgDuration.toFixed(2)},${row.cost.toFixed(4)}`
      );
    }

    // Blank line separator
    csvLines.push("");

    // Section 3: Outcome breakdown
    csvLines.push("outcome,calls");
    for (const row of outcomeBreakdown) {
      csvLines.push(`"${row.outcome}",${row.calls}`);
    }

    const csv = csvLines.join("\n");

    // 8) Return CSV response
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="analytics-${params.range}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (err) {
    // Handle authorization errors (already caught in step 3, but catch any others)
    if (err instanceof Error) {
      if (err.message.includes("Forbidden") || err.message.includes("Only owners and admins")) {
        // Return 403 JSON error WITHOUT WWW-Authenticate header
        return NextResponse.json({ error: "forbidden" }, {
          status: 403,
          headers: {
            // Explicitly do NOT include WWW-Authenticate header
          },
        });
      }
      if (err.message.includes("Unauthorized") || err.message.includes("Not authenticated") || err.message.includes("Could not resolve org_id")) {
        // Return 401 JSON error WITHOUT WWW-Authenticate header
        return NextResponse.json({ error: "Unauthorized: Please log in" }, {
          status: 401,
          headers: {
            // Explicitly do NOT include WWW-Authenticate header
          },
        });
      }
    }
    console.error("[ANALYTICS EXPORT]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

