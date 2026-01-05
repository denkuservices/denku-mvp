import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

type AuditEventInput = {
  org_id: string;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  diff: Record<string, { before: unknown; after: unknown }>;
};

export async function logAuditEvent(input: AuditEventInput) {
  const { diff, ...event } = input;

  // 1) Ana audit_log kaydı
  const { data: audit, error } = await supabaseAdmin
    .from("audit_log")
    .insert({
      org_id: event.org_id,
      actor_user_id: event.actor_user_id,
      action: event.action,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
    })
    .select("id")
    .single();

  if (error || !audit) return;

  // 2) Field-level diff
  const rows = Object.entries(diff).map(([field, values]) => ({
    audit_log_id: audit.id,
    field,
    before_value: values.before !== null ? String(values.before) : null,
    after_value: values.after !== null ? String(values.after) : null,
  }));

  if (rows.length === 0) return;

  await supabaseAdmin.from("audit_log_changes").insert(rows);
}
