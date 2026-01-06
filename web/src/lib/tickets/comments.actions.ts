"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/audit/log";
import { isWorkspacePaused } from "@/lib/workspace-status";
import { logTicketActivity } from "./activity.actions";
import type { CreateTicketCommentInput, DeleteTicketCommentInput } from "./comments.types";

/**
 * Check if user can mutate (create/delete) comments
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
    return { can: false, reason: "Only owners and admins can create or delete comments" };
  }

  return { can: true };
}

/**
 * Create comment schema
 */
const CreateCommentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(5000, "Comment is too long"),
});

/**
 * Create a new ticket comment
 */
export async function createTicketComment(
  orgId: string,
  userId: string,
  input: CreateTicketCommentInput
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  try {
    // Check permissions
    const { can, reason } = await canMutate(orgId, userId);
    if (!can) {
      return { ok: false, error: reason ?? "Unauthorized" };
    }

    // Validate input
    const parsed = CreateCommentSchema.safeParse({ body: input.body });
    if (!parsed.success) {
      // Safe error message extraction - never crashes on undefined errors array
      const errorMessage = parsed.error.errors && parsed.error.errors.length > 0
        ? parsed.error.errors[0]?.message ?? "Invalid input"
        : parsed.error.message ?? "Invalid input";
      return { ok: false, error: `Validation error: ${errorMessage}` };
    }

    // Verify ticket exists and belongs to org
    const supabase = await createSupabaseServerClient();
    const { data: ticket, error: ticketError } = await supabase
      .from("tickets")
      .select("id")
      .eq("org_id", orgId)
      .eq("id", input.ticketId)
      .maybeSingle();

    if (ticketError || !ticket) {
      return { ok: false, error: "Ticket not found" };
    }

    // Insert comment
    const { data: comment, error: insertError } = await supabaseAdmin
      .from("ticket_comments")
      .insert({
        org_id: orgId,
        ticket_id: input.ticketId,
        author_profile_id: userId,
        body: parsed.data.body,
      })
      .select("id")
      .single();

    if (insertError || !comment) {
      return { ok: false, error: `Failed to create comment: ${insertError?.message ?? "Unknown error"}` };
    }

    // Log audit event
    try {
      await logAuditEvent({
        org_id: orgId,
        actor_user_id: userId,
        action: "ticket.comment.created",
        entity_type: "ticket_comment",
        entity_id: comment.id,
        diff: {
          ticket_id: { before: null, after: input.ticketId },
          body: { before: null, after: parsed.data.body.substring(0, 100) }, // Truncate for audit
        },
      });
    } catch (auditErr) {
      // Don't fail creation if audit logging fails
      console.error("[TICKETS] Audit log failed:", auditErr);
    }

    // Log activity: ticket.comment_posted
    try {
      await logTicketActivity({
        orgId,
        ticketId: input.ticketId,
        actorProfileId: userId,
        eventType: "ticket.comment_posted",
        summary: "Comment added",
      });
    } catch (activityErr) {
      // Log error but don't fail comment creation
      console.error(
        `[TICKETS] Failed to log comment_posted activity for ticket ${input.ticketId}:`,
        activityErr instanceof Error ? activityErr.message : activityErr
      );
    }

    // Revalidate the ticket detail page
    revalidatePath(`/dashboard/tickets/${input.ticketId}`);

    return { ok: true, data: { id: comment.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Delete a ticket comment
 */
export async function deleteTicketComment(
  orgId: string,
  userId: string,
  input: DeleteTicketCommentInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // Check permissions
    const { can, reason } = await canMutate(orgId, userId);
    if (!can) {
      return { ok: false, error: reason ?? "Unauthorized" };
    }

    // Verify comment exists and belongs to org
    const supabase = await createSupabaseServerClient();
    const { data: comment, error: commentError } = await supabase
      .from("ticket_comments")
      .select("id, ticket_id")
      .eq("org_id", orgId)
      .eq("id", input.commentId)
      .maybeSingle();

    if (commentError || !comment) {
      return { ok: false, error: "Comment not found" };
    }

    // Delete comment
    const { error: deleteError } = await supabaseAdmin
      .from("ticket_comments")
      .delete()
      .eq("org_id", orgId)
      .eq("id", input.commentId);

    if (deleteError) {
      return { ok: false, error: `Failed to delete comment: ${deleteError.message}` };
    }

    // Log audit event
    try {
      await logAuditEvent({
        org_id: orgId,
        actor_user_id: userId,
        action: "ticket.comment.deleted",
        entity_type: "ticket_comment",
        entity_id: input.commentId,
        diff: {
          ticket_id: { before: comment.ticket_id, after: null },
        },
      });
    } catch (auditErr) {
      // Don't fail deletion if audit logging fails
      console.error("[TICKETS] Audit log failed:", auditErr);
    }

    // Revalidate the ticket detail page
    revalidatePath(`/dashboard/tickets/${comment.ticket_id}`);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

