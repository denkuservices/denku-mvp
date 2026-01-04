import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AuditEventDiff = Record<string, { from: unknown; to: unknown }>;

type LogAuditEventParams = {
  org_id: string;
  actor_id: string;
  action: string;
  resource: string;
  diff: AuditEventDiff;
};

/**
 * Log an audit event to the audit_events table.
 * Uses supabaseAdmin to bypass RLS (audit logs must be immutable and not filtered).
 * Server-only function.
 */
export async function logAuditEvent({ org_id, actor_id, action, resource, diff }: LogAuditEventParams) {
  const { error } = await supabaseAdmin.from("audit_events").insert({
    org_id,
    actor_id,
    action,
    resource,
    diff,
  });

  if (error) {
    // Log error but don't throw - audit failures shouldn't break the main operation
    console.error("[Audit] Failed to log audit event:", error);
    // Optionally throw if you want to make audit logging critical
    // throw new Error(`Failed to log audit event: ${error.message}`);
  }
}

