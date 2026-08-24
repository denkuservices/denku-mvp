import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { platformModelEnabled, platformUxEnabled } from "@/lib/platform/flags";
import {
  evaluateCutover,
  summarizeCutover,
  type CutoverFacts,
  type CutoverStage,
  type CutoverSummary,
} from "@/lib/platform/cutover";

/**
 * Live fact-gathering for the platform cutover gate (Phase 1).
 *
 * Read-only and best-effort: a probe that cannot answer returns `null`, which the pure
 * evaluator renders as `unknown` — never as pass or fail. Operator-facing (behind the
 * `/admin` Basic-Auth boundary), so it is platform-wide rather than org-scoped; it reads
 * only counts, never customer content.
 */

/** Rolling window for parity sampling. Long enough to catch a quiet day. */
const PARITY_WINDOW_DAYS = 7;

export interface CutoverReport {
  generatedAt: string;
  summary: CutoverSummary;
  stages: CutoverStage[];
}

/**
 * Count rows without fetching them. A missing or unreadable relation returns `null`, never 0 —
 * an absent table must never be mistaken for an empty one (that would read as "backfill done").
 */
async function countRows(db: SupabaseClient, table: string): Promise<number | null> {
  try {
    const { count, error } = await db.from(table).select("*", { head: true, count: "exact" });
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** Calls started since `since`, optionally only those already linked to a conversation. */
async function countCalls(
  db: SupabaseClient,
  since: string,
  onlyLinked: boolean
): Promise<number | null> {
  try {
    const base = db.from("calls").select("*", { head: true, count: "exact" }).gte("started_at", since);
    const { count, error } = await (onlyLinked ? base.not("conversation_id", "is", null) : base);
    return error ? null : (count ?? 0);
  } catch {
    return null;
  }
}

/** true = present, false = definitively absent, null = could not tell. */
async function relationExists(db: SupabaseClient, name: string): Promise<boolean | null> {
  try {
    const { error } = await db.from(name).select("*", { head: true, count: "exact" }).limit(1);
    if (!error) return true;
    const code = (error as { code?: string }).code;
    const msg = (error.message || "").toLowerCase();
    if (code === "42P01" || msg.includes("does not exist") || msg.includes("not find the table")) return false;
    return null;
  } catch {
    return null;
  }
}

export async function gatherCutoverFacts(
  db: SupabaseClient = supabaseAdmin,
  env: Record<string, string | undefined> = process.env
): Promise<CutoverFacts> {
  const since = new Date(Date.now() - PARITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [platformMigrationsApplied, contactsTablePresent] = await Promise.all([
    relationExists(db, "employee_channels"),
    relationExists(db, "contacts"),
  ]);

  const [conversationCount, employeeChannelCount, recentCallCount, linkedCallCount] = await Promise.all([
    countRows(db, "conversations"),
    platformMigrationsApplied === true ? countRows(db, "employee_channels") : Promise.resolve(null),
    countCalls(db, since, false),
    countCalls(db, since, true),
  ]);

  return {
    platformMigrationsApplied,
    contactsTablePresent,
    modelFlagOn: platformModelEnabled(env),
    uxFlagOn: platformUxEnabled(env),
    conversationCount,
    linkedCallCount,
    recentCallCount,
    employeeChannelCount,
  };
}

export async function getCutoverReport(
  db: SupabaseClient = supabaseAdmin,
  env: Record<string, string | undefined> = process.env
): Promise<CutoverReport> {
  let facts: CutoverFacts;
  try {
    facts = await gatherCutoverFacts(db, env);
  } catch {
    // A total probe failure must still produce a report — every stage becomes `unknown`.
    facts = {
      platformMigrationsApplied: null,
      contactsTablePresent: null,
      modelFlagOn: platformModelEnabled(env),
      uxFlagOn: platformUxEnabled(env),
      conversationCount: null,
      linkedCallCount: null,
      recentCallCount: null,
      employeeChannelCount: null,
    };
  }
  const stages = evaluateCutover(facts);
  return { generatedAt: new Date().toISOString(), summary: summarizeCutover(stages), stages };
}
