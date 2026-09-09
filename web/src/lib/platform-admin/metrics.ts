import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { denkuMarketingAssistantId } from "@/lib/denku-agent/marketingAssistant";
import { computeMargin, classifyMargin, type MarginVerdict } from "@/lib/billing/reconciliation";
import { billableMinutesForCall } from "@/lib/billing/usageMath";
import { summarizeGrants, type GrantRow } from "@/lib/billing/grants";

/**
 * The numbers a platform operator needs and no customer may see.
 *
 * **This module reads across every tenant, deliberately, and is the documented exception to the
 * house rule that every query on a tenant table carries `.eq("org_id", …)`.** That rule exists
 * because the service-role client has no safety net and a missed filter is a cross-tenant leak.
 * Here the cross-tenant read IS the feature, so the protection has to come from somewhere else:
 * every caller of this module sits behind `guardPlatformAdmin()` AND the `/admin` Basic Auth gate.
 * Do not import it from anything a customer can reach — not a dashboard page, not a tool route.
 *
 * ## Where the numbers come from, and what they are not
 *
 * Voice usage and cost are read from `org_daily_usage`, the baselined view chain (R-075), rather
 * than by summing `calls` in TypeScript. Two reasons: it is already aggregated, so this page does
 * not get slower as call volume grows; and it applies the same `ceil(seconds/60)` per call that the
 * invoice does, so a minute here is the minute the customer is charged for.
 *
 * `calls.cost_usd` is what **Vapi told us a call cost**. It is genuine COGS and it is complete —
 * every call in production carries one. What it is NOT is the whole Vapi bill: a rented phone
 * number costs money every month whether or not anybody rings it, and no webhook reports that. So
 * number rental is shown as a clearly-labelled ESTIMATE from a configured rate, never folded into
 * the observed figure.
 *
 * Chat is the honest gap. Nothing records what an LLM reply costs — `messages` has no cost column —
 * so chat COGS is reported as "not measured" and the message count is shown beside it as volume.
 * Printing $0 there would be worse than printing nothing: it reads as "chat is free".
 */

/** What Vapi charges per rented number per month. An estimate; override per environment. */
const DEFAULT_NUMBER_MONTHLY_USD = 2;

function numberMonthlyUsd(): number {
  const raw = Number(process.env.VAPI_NUMBER_MONTHLY_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_NUMBER_MONTHLY_USD;
}

/** Which kind of workspace a row belongs to. The three buckets every figure is split by. */
export type OrgBucket = "customer" | "internal" | "trial";

export interface UsageTotals {
  calls: number;
  exactMinutes: number;
  billableMinutes: number;
  costUsd: number;
}

const ZERO: UsageTotals = { calls: 0, exactMinutes: 0, billableMinutes: 0, costUsd: 0 };

function addUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    calls: a.calls + b.calls,
    exactMinutes: a.exactMinutes + b.exactMinutes,
    billableMinutes: a.billableMinutes + b.billableMinutes,
    costUsd: a.costUsd + b.costUsd,
  };
}

export interface PlatformOrgRow {
  orgId: string;
  name: string;
  createdAt: string | null;
  bucket: OrgBucket;
  ownerEmail: string | null;
  memberCount: number;
  voicePlanCode: string | null;
  chatSlots: number;
  phoneLines: number;
  grantedPhoneLines: number;
  workspaceStatus: string;
  pausedReason: string | null;
  allTime: UsageTotals;
  thisMonth: UsageTotals;
  /** Live grants, folded. Zeroes when the workspace has none. */
  grants: { voiceMinutes: number; chatSlots: number; phoneNumbers: number; endsAt: string | null };
}

export interface PlatformOverview {
  generatedAt: string;
  month: string;

  members: {
    workspaces: number;
    /** Rows in `profiles` — people attached to a workspace. */
    members: number;
    /** Accounts in Supabase Auth. Higher than `members` when somebody signed up and stopped. */
    authAccounts: number | null;
    newWorkspaces30d: number;
    payingWorkspaces: number;
    trialWorkspaces: number;
    pausedWorkspaces: number;
  };

  /** All-time and current-month voice usage, split by who was talking. */
  voice: {
    allTime: Record<OrgBucket, UsageTotals> & { total: UsageTotals };
    thisMonth: Record<OrgBucket, UsageTotals> & { total: UsageTotals };
    /** The landing-page assistant alone — pure marketing spend, a subset of `internal`. */
    landingAgent: { allTime: UsageTotals; thisMonth: UsageTotals; assistantId: string };
  };

  cost: {
    /** Observed, from Vapi's own per-call figure. */
    vapiCallsAllTimeUsd: number;
    vapiCallsThisMonthUsd: number;
    /** Estimated, from a configured rate — NOT observed. */
    numberRental: { activeLines: number; monthlyRateUsd: number; estimatedMonthlyUsd: number };
    /** Nothing measures this yet. Null is the honest answer; do not render it as zero. */
    chatLlmUsd: null;
    chatMessagesAllTime: number;
  };

  revenue: {
    month: string;
    estimatedRevenueUsd: number;
    cogsUsd: number;
    marginUsd: number;
    marginPct: number;
    verdict: MarginVerdict;
    /** Orgs the invoice preview covered. Workspaces with no voice plan are absent from it. */
    orgsCovered: number;
  };

  orgs: PlatformOrgRow[];

  /** Anything the operator should distrust about the figures above. */
  caveats: string[];
}

function monthStartUtc(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Which bucket does this workspace fall in?
 *
 * Pure, and ordered deliberately: internal wins over trial, because a Denku-operated workspace with
 * a grant on it is still Denku's own spend, and counting it as a trial would inflate the "customers
 * trying the product" figure with ourselves.
 */
export function bucketFor(input: {
  isInternal: boolean;
  hasVoicePlan: boolean;
  hasLiveGrant: boolean;
}): OrgBucket {
  if (input.isInternal) return "internal";
  if (!input.hasVoicePlan && input.hasLiveGrant) return "trial";
  return "customer";
}

type PhoneLineRow = { id: string; org_id: string; status: string | null; grant_id: string | null };

/**
 * Phone lines, whether or not the grant migration has been applied.
 *
 * `grant_id` is a new column. Postgres rejects a select naming a column that does not exist, and it
 * rejects the WHOLE statement — so on an environment still waiting for migration 20260908222350 the
 * naive query returns no rows at all, and the console would report zero phone lines and a $0 rental
 * estimate as though they were facts. A missing column has to degrade to "no line is grant-backed",
 * which is exactly true before any grant exists, rather than to "there are no lines".
 */
async function readPhoneLines(): Promise<{ data: PhoneLineRow[] | null; error: unknown; degraded: boolean }> {
  const withGrant = await supabaseAdmin.from("phone_lines").select("id, org_id, status, grant_id");
  if (!withGrant.error) {
    return { data: (withGrant.data ?? []) as PhoneLineRow[], error: null, degraded: false };
  }

  const withoutGrant = await supabaseAdmin.from("phone_lines").select("id, org_id, status");
  if (withoutGrant.error) return { data: null, error: withoutGrant.error, degraded: false };

  return {
    data: ((withoutGrant.data ?? []) as Array<{ id: string; org_id: string; status: string | null }>).map((r) => ({
      ...r,
      grant_id: null,
    })),
    error: null,
    degraded: true,
  };
}

export async function getPlatformOverview(now: Date = new Date()): Promise<PlatformOverview> {
  const month = monthStartUtc(now);
  const monthPrefix = month.slice(0, 7); // YYYY-MM
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const caveats: string[] = [];

  const [orgsRes, profilesRes, usageRes, planRes, addonsRes, linesRes, grantsRes, settingsRes] =
    await Promise.all([
      supabaseAdmin.from("orgs").select("id, name, created_at, is_internal"),
      supabaseAdmin.from("profiles").select("id, email, org_id, role, created_at"),
      supabaseAdmin
        .from("org_daily_usage")
        .select("org_id, day, total_calls, total_duration_seconds, total_minutes_exact, billable_minutes, total_cost_usd"),
      supabaseAdmin.from("org_plan_limits").select("org_id, plan_code"),
      supabaseAdmin.from("billing_org_addons").select("org_id, addon_key, qty, status"),
      readPhoneLines(),
      supabaseAdmin
        .from("org_grants")
        .select("id, org_id, kind, amount, starts_at, expires_at, status, note, granted_by, created_at")
        .eq("status", "active"),
      supabaseAdmin.from("organization_settings").select("org_id, workspace_status, paused_reason"),
    ]);

  if (grantsRes.error) {
    // The table may simply not be migrated yet. Say so rather than showing zero grants as fact.
    caveats.push(
      "Grant table unreadable (migration 20260908222350 may not be applied): grants shown as none."
    );
  }
  if (usageRes.error) {
    caveats.push("Usage view unreadable — every minute and cost figure below is incomplete.");
  }
  if (linesRes.degraded) {
    caveats.push(
      "phone_lines.grant_id is missing (migration 20260908222350 not applied): no line can be shown as grant-backed."
    );
  }
  if (linesRes.error) {
    caveats.push("Phone lines unreadable — line counts and the rental estimate below are missing.");
  }

  const orgs = (orgsRes.data ?? []) as Array<{
    id: string;
    name: string | null;
    created_at: string | null;
    is_internal: boolean | null;
  }>;
  const profiles = (profilesRes.data ?? []) as Array<{
    id: string;
    email: string | null;
    org_id: string | null;
    role: string | null;
    created_at: string | null;
  }>;

  // --- per-org indexes -------------------------------------------------------------------------
  const planByOrg = new Map<string, string | null>();
  for (const row of (planRes.data ?? []) as Array<{ org_id: string; plan_code: string | null }>) {
    planByOrg.set(row.org_id, row.plan_code);
  }

  const chatSlotsByOrg = new Map<string, number>();
  for (const row of (addonsRes.data ?? []) as Array<{ org_id: string; addon_key: string; qty: number | null; status: string | null }>) {
    if (row.status !== "active") continue;
    // Mirrors CHAT_ADDON_SLOTS without importing the server-only entitlement module; the operator
    // view wants the purchased tier, not the effective entitlement (which grants already inflate).
    const per = row.addon_key === "chat_basic" ? 1 : row.addon_key === "chat_standard" ? 2 : 0;
    if (per === 0) continue;
    chatSlotsByOrg.set(row.org_id, (chatSlotsByOrg.get(row.org_id) ?? 0) + per * (Number(row.qty) || 0));
  }

  const linesByOrg = new Map<string, { total: number; granted: number }>();
  for (const row of (linesRes.data ?? []) as Array<{ org_id: string; grant_id: string | null }>) {
    const entry = linesByOrg.get(row.org_id) ?? { total: 0, granted: 0 };
    entry.total++;
    if (row.grant_id) entry.granted++;
    linesByOrg.set(row.org_id, entry);
  }

  const grantsByOrg = new Map<string, GrantRow[]>();
  for (const row of (grantsRes.data ?? []) as GrantRow[]) {
    const list = grantsByOrg.get(row.org_id) ?? [];
    list.push(row);
    grantsByOrg.set(row.org_id, list);
  }

  const settingsByOrg = new Map<string, { status: string; reason: string | null }>();
  for (const row of (settingsRes.data ?? []) as Array<{ org_id: string; workspace_status: string | null; paused_reason: string | null }>) {
    settingsByOrg.set(row.org_id, {
      status: row.workspace_status ?? "active",
      reason: row.paused_reason ?? null,
    });
  }

  const membersByOrg = new Map<string, number>();
  const ownerByOrg = new Map<string, string>();
  for (const p of profiles) {
    if (!p.org_id) continue;
    membersByOrg.set(p.org_id, (membersByOrg.get(p.org_id) ?? 0) + 1);
    if (p.role === "owner" && p.email && !ownerByOrg.has(p.org_id)) ownerByOrg.set(p.org_id, p.email);
  }

  const usageAll = new Map<string, UsageTotals>();
  const usageMonth = new Map<string, UsageTotals>();
  for (const row of (usageRes.data ?? []) as Array<{
    org_id: string;
    day: string;
    total_calls: number | null;
    total_duration_seconds: number | null;
    total_minutes_exact: number | string | null;
    billable_minutes: number | null;
    total_cost_usd: number | string | null;
  }>) {
    const totals: UsageTotals = {
      calls: Number(row.total_calls ?? 0),
      exactMinutes: Number(row.total_minutes_exact ?? 0),
      billableMinutes: Number(row.billable_minutes ?? 0),
      costUsd: Number(row.total_cost_usd ?? 0),
    };
    usageAll.set(row.org_id, addUsage(usageAll.get(row.org_id) ?? ZERO, totals));
    if (typeof row.day === "string" && row.day.startsWith(monthPrefix)) {
      usageMonth.set(row.org_id, addUsage(usageMonth.get(row.org_id) ?? ZERO, totals));
    }
  }

  // --- rows + bucket rollups -------------------------------------------------------------------
  const emptyByBucket = (): Record<OrgBucket, UsageTotals> & { total: UsageTotals } => ({
    customer: ZERO,
    internal: ZERO,
    trial: ZERO,
    total: ZERO,
  });
  const allTimeByBucket = emptyByBucket();
  const thisMonthByBucket = emptyByBucket();

  let payingWorkspaces = 0;
  let trialWorkspaces = 0;
  let pausedWorkspaces = 0;
  let newWorkspaces30d = 0;

  const rows: PlatformOrgRow[] = orgs.map((org) => {
    const grantSummary = summarizeGrants(grantsByOrg.get(org.id) ?? [], now);
    const voicePlanCode = planByOrg.get(org.id) ?? null;
    const chatSlots = chatSlotsByOrg.get(org.id) ?? 0;
    const hasLiveGrant =
      grantSummary.voiceMinutes > 0 || grantSummary.chatSlots > 0 || grantSummary.phoneNumbers > 0;
    const bucket = bucketFor({
      isInternal: org.is_internal === true,
      hasVoicePlan: Boolean(voicePlanCode),
      hasLiveGrant,
    });

    const settings = settingsByOrg.get(org.id) ?? { status: "active", reason: null };
    const lines = linesByOrg.get(org.id) ?? { total: 0, granted: 0 };
    const allTime = usageAll.get(org.id) ?? ZERO;
    const thisMonth = usageMonth.get(org.id) ?? ZERO;

    allTimeByBucket[bucket] = addUsage(allTimeByBucket[bucket], allTime);
    allTimeByBucket.total = addUsage(allTimeByBucket.total, allTime);
    thisMonthByBucket[bucket] = addUsage(thisMonthByBucket[bucket], thisMonth);
    thisMonthByBucket.total = addUsage(thisMonthByBucket.total, thisMonth);

    if (bucket === "customer" && (voicePlanCode || chatSlots > 0)) payingWorkspaces++;
    if (bucket === "trial") trialWorkspaces++;
    if (settings.status === "paused") pausedWorkspaces++;
    if (org.created_at && org.created_at >= thirtyDaysAgo) newWorkspaces30d++;

    return {
      orgId: org.id,
      name: org.name ?? "(unnamed)",
      createdAt: org.created_at,
      bucket,
      ownerEmail: ownerByOrg.get(org.id) ?? null,
      memberCount: membersByOrg.get(org.id) ?? 0,
      voicePlanCode,
      chatSlots,
      phoneLines: lines.total,
      grantedPhoneLines: lines.granted,
      workspaceStatus: settings.status,
      pausedReason: settings.reason,
      allTime,
      thisMonth,
      grants: {
        voiceMinutes: grantSummary.voiceMinutes,
        chatSlots: grantSummary.chatSlots,
        phoneNumbers: grantSummary.phoneNumbers,
        endsAt: grantSummary.endsAt,
      },
    };
  });

  rows.sort((a, b) => b.allTime.costUsd - a.allTime.costUsd);

  // --- the landing-page assistant, on its own -------------------------------------------------
  const assistantId = denkuMarketingAssistantId();
  const landing = { allTime: { ...ZERO }, thisMonth: { ...ZERO }, assistantId };
  const { data: demoCalls, error: demoErr } = await supabaseAdmin
    .from("calls")
    .select("duration_seconds, cost_usd, ended_at")
    .eq("vapi_assistant_id", assistantId)
    .not("ended_at", "is", null)
    // A bound, because this one query reads rows rather than an aggregate. If the demo ever gets
    // busy enough to hit it the figure becomes a floor, and the caveat below says so.
    .limit(5000);

  if (demoErr) {
    caveats.push("Landing-page assistant usage could not be read; marketing spend is missing below.");
  } else {
    for (const call of (demoCalls ?? []) as Array<{
      duration_seconds: number | null;
      cost_usd: number | string | null;
      ended_at: string | null;
    }>) {
      const totals: UsageTotals = {
        calls: 1,
        exactMinutes: (call.duration_seconds ?? 0) / 60,
        billableMinutes: billableMinutesForCall(call.duration_seconds),
        costUsd: Number(call.cost_usd ?? 0),
      };
      landing.allTime = addUsage(landing.allTime, totals);
      if (call.ended_at && call.ended_at.startsWith(monthPrefix)) {
        landing.thisMonth = addUsage(landing.thisMonth, totals);
      }
    }
    if ((demoCalls?.length ?? 0) >= 5000) {
      caveats.push("Landing-page figures are capped at 5,000 calls and understate the real total.");
    }
  }

  // --- revenue against COGS, for the current month ---------------------------------------------
  const { data: invoice } = await supabaseAdmin
    .from("org_monthly_invoice_preview")
    .select("org_id, total_cost_usd, estimated_total_due_usd")
    .eq("month", month);

  let estimatedRevenueUsd = 0;
  let invoiceCogs = 0;
  for (const row of (invoice ?? []) as Array<{ total_cost_usd: number | string | null; estimated_total_due_usd: number | string | null }>) {
    estimatedRevenueUsd += Number(row.estimated_total_due_usd ?? 0);
    invoiceCogs += Number(row.total_cost_usd ?? 0);
  }
  const { marginUsd, marginPct } = computeMargin(estimatedRevenueUsd, invoiceCogs);

  /*
   * `org_monthly_invoice_preview` INNER JOINs the plan tables, so a workspace with no voice plan —
   * every chat customer, every trial — produces no row at all. That is not a bug to work around
   * here; it is a limit of the view, and the operator needs to know the revenue line covers fewer
   * workspaces than the page lists.
   */
  const orgsCovered = (invoice ?? []).length;
  if (orgsCovered < rows.length) {
    caveats.push(
      `Revenue covers ${orgsCovered} of ${rows.length} workspaces: the invoice view has no row for a workspace without a voice plan (chat-only and trial workspaces are absent).`
    );
  }

  // --- costs nobody reports to us ---------------------------------------------------------------
  const activeLines = (linesRes.data ?? []).length;
  const rate = numberMonthlyUsd();

  const { count: messageCount } = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true });

  caveats.push(
    "Chat LLM cost is not measured anywhere — `messages` has no cost column — so it is shown as unknown rather than zero."
  );
  caveats.push(
    `Number rental is an ESTIMATE (${activeLines} lines x $${rate}/mo), not an observed Vapi charge.`
  );

  // Supabase Auth account count. Best-effort: it is a separate API and a paginated one, and the
  // page must render without it rather than fail.
  let authAccounts: number | null = null;
  try {
    const { data: authList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    authAccounts = authList?.users?.length ?? null;
    if (authAccounts === 1000) {
      caveats.push("Auth account count is capped at 1,000 and understates the real total.");
    }
  } catch {
    caveats.push("Supabase Auth account count unavailable.");
  }

  return {
    generatedAt: now.toISOString(),
    month,
    members: {
      workspaces: orgs.length,
      members: profiles.length,
      authAccounts,
      newWorkspaces30d,
      payingWorkspaces,
      trialWorkspaces,
      pausedWorkspaces,
    },
    voice: {
      allTime: allTimeByBucket,
      thisMonth: thisMonthByBucket,
      landingAgent: landing,
    },
    cost: {
      vapiCallsAllTimeUsd: allTimeByBucket.total.costUsd,
      vapiCallsThisMonthUsd: thisMonthByBucket.total.costUsd,
      numberRental: {
        activeLines,
        monthlyRateUsd: rate,
        estimatedMonthlyUsd: activeLines * rate,
      },
      chatLlmUsd: null,
      chatMessagesAllTime: messageCount ?? 0,
    },
    revenue: {
      month,
      estimatedRevenueUsd,
      cogsUsd: invoiceCogs,
      marginUsd,
      marginPct,
      verdict: classifyMargin(marginUsd, marginPct),
      orgsCovered,
    },
    orgs: rows,
    caveats,
  };
}
