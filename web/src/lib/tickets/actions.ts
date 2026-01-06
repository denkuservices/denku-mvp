"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { isWorkspacePaused } from "@/lib/workspace-status";
import { logTicketActivity } from "./activity.actions";
import { getStatusLabel, getPriorityLabel } from "./utils.client";
import type { CreateTicketInput, UpdateTicketInput } from "./types";

/**
 * Check if user can mutate (create/update) tickets
 */
async function canMutate(orgId: string, userId: string): Promise<{ can: boolean; reason?: string }> {
  // Check workspace status
  const paused = await isWorkspacePaused(orgId);
  if (paused) {
    return { can: false, reason: "Workspace is paused. Changes are disabled." };
  }

  // Check role
  const supabase = await createSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .eq("org_id", orgId)
    .maybeSingle<{ role: string | null }>();

  if (error || !profile) {
    return { can: false, reason: "User not found" };
  }

  const role = profile.role;
  if (role !== "owner" && role !== "admin") {
    return { can: false, reason: "Only owners and admins can create or update tickets" };
  }

  return { can: true };
}

/**
 * Create ticket schema
 */
const CreateTicketSchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  callId: z.string().uuid().nullable().optional(),
  subject: z.string().trim().min(1).max(500),
  description: z.string().trim().nullable().optional(),
  status: z.string().default("open"),
  priority: z.string().default("medium"),
});

/**
 * Create a new ticket
 */
export async function createTicket(
  orgId: string,
  userId: string,
  input: CreateTicketInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    // Check permissions
    const { can, reason } = await canMutate(orgId, userId);
    if (!can) {
      return { ok: false, error: reason ?? "Unauthorized" };
    }

    // Validate input
    const parsed = CreateTicketSchema.safeParse({
      leadId: input.leadId ?? null,
      callId: input.callId ?? null,
      subject: input.subject,
      description: input.description ?? null,
      status: input.status ?? "open",
      priority: input.priority ?? "medium",
    });

    if (!parsed.success) {
      return { ok: false, error: `Validation error: ${parsed.error.message}` };
    }

    // Insert ticket
    const { data: ticket, error: insertError } = await supabaseAdmin
      .from("tickets")
      .insert({
        org_id: orgId,
        lead_id: parsed.data.leadId,
        call_id: parsed.data.callId,
        subject: parsed.data.subject,
        description: parsed.data.description,
        status: parsed.data.status,
        priority: parsed.data.priority,
      })
      .select("id")
      .single();

    if (insertError || !ticket) {
      return { ok: false, error: `Failed to create ticket: ${insertError?.message ?? "Unknown error"}` };
    }

    // Log audit event
    try {
      await logAuditEvent({
        org_id: orgId,
        actor_user_id: userId,
        action: "ticket.created",
        entity_type: "ticket",
        entity_id: ticket.id,
        diff: {
          subject: { before: null, after: parsed.data.subject },
          status: { before: null, after: parsed.data.status },
          priority: { before: null, after: parsed.data.priority },
        },
      });
    } catch (auditErr) {
      // Don't fail creation if audit logging fails
      console.error("[TICKETS] Audit log failed:", auditErr);
    }

    // Log activity: ticket.created
    try {
      await logTicketActivity({
        orgId,
        ticketId: ticket.id,
        actorProfileId: userId,
        eventType: "ticket.created",
        summary: "Ticket created",
        diff: {
          subject: { before: null, after: parsed.data.subject },
          status: { before: null, after: parsed.data.status },
          priority: { before: null, after: parsed.data.priority },
        },
      });
    } catch (activityErr) {
      // Log error but don't fail ticket creation
      console.error(
        `[TICKETS] Failed to log created activity for ticket ${ticket.id}:`,
        activityErr instanceof Error ? activityErr.message : activityErr
      );
    }

    return { ok: true, data: { id: ticket.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Update ticket schema
 */
const UpdateTicketSchema = z.object({
  subject: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
});

/**
 * Update an existing ticket
 */
export async function updateTicket(
  orgId: string,
  userId: string,
  input: UpdateTicketInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    // Get authenticated user from session first
    const supabase = await createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData?.user) {
      return { ok: false, error: "Not authenticated" };
    }

    // Resolve actor profile ID from authenticated user (ensures correctness)
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, org_id")
      .eq("id", authData.user.id)
      .eq("org_id", orgId)
      .maybeSingle();

    if (profileError || !profile) {
      return { ok: false, error: "User profile not found" };
    }

    // Verify caller-provided userId matches authenticated user (security check)
    if (userId !== authData.user.id && userId !== profile.id) {
      return { ok: false, error: "User ID mismatch" };
    }

    // Check permissions using authenticated profile
    const { can, reason } = await canMutate(orgId, profile.id);
    if (!can) {
      return { ok: false, error: reason ?? "Unauthorized" };
    }

    const actorProfileId = profile.id; // Use resolved profile.id as actor_profile_id

    // Validate input
    const parsed = UpdateTicketSchema.safeParse(input.patch);
    if (!parsed.success) {
      return { ok: false, error: `Validation error: ${parsed.error.message}` };
    }

    // Fetch existing ticket BEFORE update to get "before" values
    const { data: before, error: fetchError } = await supabase
      .from("tickets")
      .select("id, subject, description, status, priority")
      .eq("org_id", orgId)
      .eq("id", input.ticketId)
      .single();

    if (fetchError || !before) {
      return { ok: false, error: `Ticket not found: ${fetchError?.message ?? "Unknown error"}` };
    }

    // Build update payload (only include fields that changed)
    const updatePayload: Record<string, any> = {};
    const diff: Record<string, { before: unknown; after: unknown }> = {};

    if (parsed.data.subject !== undefined && parsed.data.subject !== before.subject) {
      updatePayload.subject = parsed.data.subject;
      diff.subject = { before: before.subject, after: parsed.data.subject };
    }

    if (parsed.data.description !== undefined && parsed.data.description !== before.description) {
      updatePayload.description = parsed.data.description;
      diff.description = { before: before.description ?? null, after: parsed.data.description ?? null };
    }

    if (parsed.data.status !== undefined && parsed.data.status !== before.status) {
      updatePayload.status = parsed.data.status;
      diff.status = { before: before.status, after: parsed.data.status };
    }

    if (parsed.data.priority !== undefined && parsed.data.priority !== before.priority) {
      updatePayload.priority = parsed.data.priority;
      diff.priority = { before: before.priority, after: parsed.data.priority };
    }

    // If no changes, return early
    if (Object.keys(updatePayload).length === 0) {
      return { ok: true, data: { id: input.ticketId } };
    }

    // Update ticket
    const { error: updateError } = await supabaseAdmin
      .from("tickets")
      .update(updatePayload)
      .eq("org_id", orgId)
      .eq("id", input.ticketId);

    if (updateError) {
      return { ok: false, error: `Failed to update ticket: ${updateError.message}` };
    }

    // Log audit event
    try {
      await logAuditEvent({
        org_id: orgId,
        actor_user_id: userId,
        action: "ticket.updated",
        entity_type: "ticket",
        entity_id: input.ticketId,
        diff,
      });
    } catch (auditErr) {
      // Don't fail update if audit logging fails
      console.error("[TICKETS] Audit log failed:", auditErr);
    }

    // Fetch AFTER values from DB (do NOT rely on updatePayload - fetch actual DB state)
    const { data: after, error: afterFetchError } = await supabase
      .from("tickets")
      .select("status, priority")
      .eq("org_id", orgId)
      .eq("id", input.ticketId)
      .single();

    if (afterFetchError || !after) {
      // If we can't fetch after values, skip activity logging but don't fail the update
      console.error(`[TICKETS] Failed to fetch after values for activity logging (ticket ${input.ticketId}):`, afterFetchError?.message ?? "Unknown error");
      revalidatePath(`/dashboard/tickets/${input.ticketId}`);
      return { ok: true, data: { id: input.ticketId } };
    }

    // Normalize before/after values for deterministic comparison
    // Map "resolved" to "closed" for consistency
    const normalizeStatus = (v: string | null | undefined): string => {
      const normalized = (v ?? "").trim().toLowerCase();
      // Treat "resolved" as "closed"
      return normalized === "resolved" ? "closed" : normalized;
    };
    const normalize = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();
    const beforeStatusNorm = normalizeStatus(before.status);
    const afterStatusNorm = normalizeStatus(after.status);
    const beforePriorityNorm = normalize(before.priority);
    const afterPriorityNorm = normalize(after.priority);

    // Log activity events deterministically AFTER successful update
    // Best-effort logging: errors are logged but don't fail the update
    if (beforeStatusNorm !== afterStatusNorm) {
      // Ensure diff is always a valid object with {before, after} structure
      const statusDiff: Record<string, { before: unknown; after: unknown }> = {
        status: {
          before: beforeStatusNorm,
          after: afterStatusNorm,
        },
      };

      const source = input.source ?? "other";
      const beforeClosed = beforeStatusNorm === "closed";
      const afterClosed = afterStatusNorm === "closed";
      const afterOpen = afterStatusNorm === "open" || afterStatusNorm === "in_progress";

      // Primary action: log only resolved/reopened (not status_changed)
      if (source === "primary_action") {
        // Close ticket: log only ticket.resolved
        if (!beforeClosed && afterClosed) {
          try {
            await logTicketActivity({
              orgId,
              ticketId: input.ticketId,
              actorProfileId,
              eventType: "ticket.resolved",
              summary: "Ticket closed",
              diff: statusDiff,
            });
          } catch (activityErr) {
            // Activity logging failed but don't fail the update
          }
        }
        // Reopen ticket: log only ticket.reopened
        else if (beforeClosed && afterOpen) {
          try {
            await logTicketActivity({
              orgId,
              ticketId: input.ticketId,
              actorProfileId,
              eventType: "ticket.reopened",
              summary: "Ticket reopened",
              diff: statusDiff,
            });
          } catch (activityErr) {
            // Activity logging failed but don't fail the update
          }
        }
      }
      // Dropdown or other: log only ticket.status_changed (not resolved/reopened)
      else {
        try {
          const statusLabel = getStatusLabel(after.status);
          await logTicketActivity({
            orgId,
            ticketId: input.ticketId,
            actorProfileId,
            eventType: "ticket.status_changed",
            summary: `Status changed to ${statusLabel}`,
            diff: statusDiff,
          });
        } catch (activityErr) {
          // Activity logging failed but don't fail the update
        }
      }
    }

    if (beforePriorityNorm !== afterPriorityNorm) {
      // Ensure diff is always a valid object with {before, after} structure
      const priorityDiff: Record<string, { before: unknown; after: unknown }> = {
        priority: {
          before: beforePriorityNorm,
          after: afterPriorityNorm,
        },
      };

      try {
        const priorityLabel = getPriorityLabel(after.priority);
        await logTicketActivity({
          orgId,
          ticketId: input.ticketId,
          actorProfileId,
          eventType: "ticket.priority_changed",
          summary: `Priority changed to ${priorityLabel}`,
          diff: priorityDiff,
        });
      } catch (activityErr) {
        // Activity logging failed but don't fail the update
      }
    }

    // Revalidate the ticket detail page to refresh Activity section
    revalidatePath(`/dashboard/tickets/${input.ticketId}`);

    return { ok: true, data: { id: input.ticketId } };
  } catch (err) {
    // Enhanced error message for debugging (dev only, no secrets)
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `updateTicket failed: ${errorMessage}` };
  }
}

