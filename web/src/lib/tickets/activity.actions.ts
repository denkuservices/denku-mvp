"use server";

import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { LogTicketActivityInput } from "./activity.types";

/**
 * Log ticket activity schema
 */
const LogActivitySchema = z.object({
  eventType: z.enum([
    "ticket.created",
    "ticket.status_changed",
    "ticket.priority_changed",
    "ticket.resolved",
    "ticket.reopened",
    "ticket.comment_posted",
  ]),
  summary: z.string().trim().max(500).nullable().optional(),
  // diff must be a record where each value is { before: any, after: any }
  // Accepts null/undefined for events without diffs (e.g., comment_posted)
  diff: z
    .record(
      z.string(),
      z.object({
        before: z.any().optional().nullable(),
        after: z.any().optional().nullable(),
      })
    )
    .nullable()
    .optional(),
});

/**
 * Normalize diff to ensure all values are {before, after} objects
 * Converts primitives (string/number/etc) to {before: null, after: value}
 * Preserves existing {before, after} objects
 * Handles JSON string parsing
 */
function normalizeDiff(
  diff: unknown
): Record<string, { before: unknown; after: unknown }> | null {
  if (diff == null) return null;

  // If diff is a JSON string, try parse
  if (typeof diff === "string") {
    const s = diff.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return normalizeDiff(parsed);
    } catch {
      return null; // not valid JSON
    }
  }

  if (typeof diff !== "object" || Array.isArray(diff)) return null;

  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const [k, v] of Object.entries(diff as Record<string, any>)) {
    if (v && typeof v === "object" && !Array.isArray(v) && ("before" in v || "after" in v)) {
      out[k] = { before: (v as any).before ?? null, after: (v as any).after ?? null };
    } else {
      out[k] = { before: null, after: v ?? null };
    }
  }
  return out;
}

/**
 * Log a ticket activity event
 * This should only be called from server actions after successful mutations
 * Throws on failure to ensure errors are not silently swallowed
 */
export async function logTicketActivity(input: LogTicketActivityInput): Promise<void> {
  // Normalize diff BEFORE Zod validation to handle callers that pass primitives
  const normalizedDiff = normalizeDiff(input.diff);
  const normalizedInput = { ...input, diff: normalizedDiff };

  // DEV-ONLY: Assert normalized diff shape
  if (process.env.NODE_ENV !== "production" && normalizedInput.diff) {
    const bad = Object.entries(normalizedInput.diff).find(
      ([, v]) => typeof v !== "object" || v === null || Array.isArray(v)
    );
    if (bad) {
      throw new Error(`Invalid normalized diff for "${bad[0]}" — expected {before, after} object`);
    }
  }

  // Validate normalized input
  const parsed = LogActivitySchema.safeParse({
    eventType: normalizedInput.eventType,
    summary: normalizedInput.summary,
    diff: normalizedInput.diff,
  });

  if (!parsed.success) {
    // Safe error message extraction - never crashes on undefined issues array
    const errorMessage = parsed.error.issues && parsed.error.issues.length > 0
      ? parsed.error.issues[0]?.message ?? "Invalid input"
      : parsed.error.message ?? "Invalid input";
    throw new Error(
      `Failed to log activity (${input.eventType}) for ticket ${input.ticketId}: Validation error: ${errorMessage}`
    );
  }

  // Use authenticated server client (respects RLS)
  const supabase = await createSupabaseServerClient();

  // Verify ticket exists and belongs to org
  const { data: ticket, error: ticketError } = await supabase
    .from("tickets")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("id", input.ticketId)
    .maybeSingle();

  if (ticketError || !ticket) {
    throw new Error(
      `Failed to log activity (${input.eventType}) for ticket ${input.ticketId}: Ticket not found or access denied`
    );
  }

  // Insert activity using authenticated client (RLS will enforce permissions)
  // Supabase JSONB columns accept JavaScript objects directly
  const { error: insertError } = await supabase.from("ticket_activity").insert({
    org_id: input.orgId,
    ticket_id: input.ticketId,
    actor_profile_id: input.actorProfileId ?? null,
    event_type: parsed.data.eventType,
    summary: parsed.data.summary ?? null,
    diff: parsed.data.diff ?? null, // Pass object directly, Supabase handles JSONB
  });

  if (insertError) {
    throw new Error(
      `Failed to log activity (${input.eventType}) for ticket ${input.ticketId}: ${insertError.message}`
    );
  }
}

