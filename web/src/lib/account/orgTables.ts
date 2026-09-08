import "server-only";

/**
 * Every table that holds a workspace's data, in the order it is safe to empty.
 *
 * **Why a written list.** Denku has 48 tenant tables carrying `org_id` and only 12 of them have a
 * foreign key to `orgs`. `delete from orgs` therefore removes the workspace and leaves three
 * quarters of that business's data behind — transcripts, customer phone numbers, encrypted channel
 * tokens, message bodies — keyed to an org id that no longer resolves. Nobody would ever see the
 * leftovers, which is exactly why nobody would ever notice them.
 *
 * Discovering the list from the catalogue at runtime would be worse, not better: it would silently
 * start deleting from a table added later, in whatever order the catalogue returned, and a purge is
 * not a place for surprises. A new tenant table means a new line here, and
 * `test/purge-org-data.test.ts` fails until this list and the SQL function agree.
 *
 * **The order is load-bearing.** Children first, so the foreign keys that are `no action` never
 * fire. `tickets` takes `ticket_activity` and `ticket_comments` with it by cascade, and `audit_log`
 * takes `audit_log_changes`; everything else is listed explicitly.
 */
export const ORG_SCOPED_TABLES: readonly string[] = [
  "instagram_webhook_events",
  "conversation_drafts",
  "conversation_reads",
  "conversation_stars",
  "conversation_handling",
  "messages",
  "appointments",
  "tickets",
  "calls",
  "conversations",
  "contact_identities",
  "contact_notes",
  "contact_requests",
  "contacts",
  "leads",
  "agent_knowledge_documents",
  "employee_channels",
  "employee_manifests",
  "web_chat_sessions",
  "web_chat_connections",
  "telegram_connections",
  "instagram_connections",
  "instagram_data_deletion_requests",
  "email_connections",
  "commerce_connections",
  "phone_lines",
  "sip_trunks",
  "agents",
  "billing_anomaly_events",
  "billing_guardrails",
  "billing_invoice_runs",
  "billing_org_addons",
  "billing_overage_state",
  "billing_stripe_customers",
  "billing_usage_alerts",
  "call_concurrency_leases",
  "onboarding_activation_lock",
  "org_active_channels",
  "org_invites",
  "org_plan_overrides",
  "organization_settings",
  "saved_views",
  "webhook_debug",
  "email_dispatch_log",
  "audit_log",
] as const;

/** Private buckets whose object keys begin with the org id (`<org>/…`). */
export const ORG_PREFIXED_BUCKETS: readonly string[] = ["channel-media", "knowledge-documents"] as const;
