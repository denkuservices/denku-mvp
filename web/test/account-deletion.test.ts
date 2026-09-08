import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The module reaches for the service-role client at import time (it is a fail-fast singleton).
// Nothing here calls the database — these assertions are about the list, the order and the gates.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { accountHasPassword } from "@/lib/account/deleteAccount";
import { ORG_PREFIXED_BUCKETS, ORG_SCOPED_TABLES } from "@/lib/account/orgTables";

/**
 * Deleting an account has to actually delete the account.
 *
 * The failure this file exists for is silent by construction: 36 of Denku's 48 tenant tables have
 * no foreign key to `orgs`, so a purge that forgets one leaves that business's transcripts,
 * customer numbers or encrypted channel tokens behind and every screen still looks correct. The
 * only way to notice is to check the list against the schema — which is what the first block does,
 * against the table list captured from production on 2026-09-08.
 */

/**
 * Every `org_id`-carrying table in `public`, read from the live schema on 2026-09-08.
 *
 * A literal rather than a query: the test suite mocks Supabase and never reaches a database. When
 * a migration adds a tenant table, this list and `ORG_SCOPED_TABLES` are updated together — and
 * the failure in between is the point.
 */
const ORG_SCOPED_TABLES_IN_SCHEMA = [
  "agent_knowledge_documents", "agents", "appointments", "audit_log", "billing_anomaly_events",
  "billing_guardrails", "billing_invoice_runs", "billing_org_addons", "billing_overage_state",
  "billing_stripe_customers", "billing_usage_alerts", "call_concurrency_leases", "calls",
  "commerce_connections", "contact_identities", "contact_notes", "contact_requests", "contacts",
  "conversation_drafts", "conversation_handling", "conversation_reads", "conversation_stars",
  "conversations", "email_connections", "email_dispatch_log", "employee_channels",
  "employee_manifests", "instagram_connections", "instagram_data_deletion_requests",
  "instagram_webhook_events", "leads", "messages", "onboarding_activation_lock",
  "org_active_channels", "org_invites", "org_plan_overrides", "organization_settings",
  "phone_lines", "profiles", "saved_views", "sip_trunks", "telegram_connections",
  "ticket_activity", "ticket_comments", "tickets", "web_chat_connections", "web_chat_sessions",
  "webhook_debug",
];

/**
 * The two that are deliberately absent from the purge list, and why.
 *
 * `profiles` is detached rather than deleted — a colleague keeps their Denku account. `tickets`
 * carries `ticket_activity` and `ticket_comments` away by cascade, so listing them separately
 * would delete rows whose parent is already gone.
 */
const HANDLED_ELSEWHERE = new Set(["profiles", "ticket_activity", "ticket_comments"]);

describe("the purge list matches the schema", () => {
  it("covers every tenant table", () => {
    const missing = ORG_SCOPED_TABLES_IN_SCHEMA.filter(
      (t) => !HANDLED_ELSEWHERE.has(t) && !ORG_SCOPED_TABLES.includes(t)
    );
    expect(missing).toEqual([]);
  });

  it("names no table that does not exist", () => {
    const unknown = ORG_SCOPED_TABLES.filter((t) => !ORG_SCOPED_TABLES_IN_SCHEMA.includes(t));
    expect(unknown).toEqual([]);
  });

  it("lists each table once", () => {
    expect(new Set(ORG_SCOPED_TABLES).size).toBe(ORG_SCOPED_TABLES.length);
  });

  it("deletes children before the parents that cascade into them", () => {
    const at = (t: string) => ORG_SCOPED_TABLES.indexOf(t);
    // conversations cascades into messages and drafts; deleting the parent first would make the
    // child deletes no-ops that hide a real failure.
    expect(at("messages")).toBeLessThan(at("conversations"));
    expect(at("conversation_drafts")).toBeLessThan(at("conversations"));
    // appointments/tickets/calls reference conversations, leads and contacts with `set null`.
    expect(at("appointments")).toBeLessThan(at("conversations"));
    expect(at("tickets")).toBeLessThan(at("contacts"));
    expect(at("calls")).toBeLessThan(at("agents"));
    expect(at("conversations")).toBeLessThan(at("agents"));
    expect(at("contact_identities")).toBeLessThan(at("contacts"));
    expect(at("web_chat_sessions")).toBeLessThan(at("web_chat_connections"));
    expect(at("employee_channels")).toBeLessThan(at("agents"));
    expect(at("employee_manifests")).toBeLessThan(at("agents"));
    expect(at("agent_knowledge_documents")).toBeLessThan(at("agents"));
  });
});

describe("the SQL function and the TypeScript list say the same thing", () => {
  const migrationsDir = join(process.cwd(), "..", "supabase", "migrations");
  const file = readdirSync(migrationsDir).find((f) => f.endsWith("_purge_org_data.sql"));

  it("ships a migration", () => {
    expect(file).toBeTruthy();
  });

  it("walks the same tables in the same order", () => {
    const sql = readFileSync(join(migrationsDir, file as string), "utf8");
    const opening = "v_tables text[] := array[";
    const body = sql.slice(sql.indexOf(opening) + opening.length);
    const listed = Array.from(body.slice(0, body.indexOf("]")).matchAll(/'([a-z_]+)'/g)).map(
      (m) => m[1]
    );
    expect(listed).toEqual([...ORG_SCOPED_TABLES]);
  });

  it("is reachable only by the service role", () => {
    const sql = readFileSync(join(migrationsDir, file as string), "utf8");
    // An `authenticated` grant would turn this into a one-argument endpoint for destroying any
    // workspace whose id you can guess.
    expect(sql).toMatch(/revoke all on function public\.purge_org_data\(uuid\) from authenticated/);
    expect(sql).toMatch(/revoke all on function public\.purge_org_data\(uuid\) from anon/);
    expect(sql).toMatch(/grant execute on function public\.purge_org_data\(uuid\) to service_role/);
    expect(sql).not.toMatch(/grant execute on function public\.purge_org_data\(uuid\) to authenticated/);
  });
});

describe("re-authentication before the delete", () => {
  it("asks a password account for its password", () => {
    expect(accountHasPassword({ identities: [{ provider: "email" }] })).toBe(true);
    expect(accountHasPassword({ identities: [], app_metadata: { provider: "email" } })).toBe(true);
    // No identities and no provider at all still reads as an email account — the password form is
    // shown in that case too, so the two must agree.
    expect(accountHasPassword({ identities: [], app_metadata: null })).toBe(true);
  });

  it("does not ask an OAuth account for a password it does not have", () => {
    expect(accountHasPassword({ identities: [{ provider: "google" }] })).toBe(false);
    expect(accountHasPassword({ identities: [{ provider: "facebook" }] })).toBe(false);
  });

  it("refuses when there is no user at all", () => {
    expect(accountHasPassword(null)).toBe(false);
  });
});

describe("the order the deletion runs in", () => {
  const source = readFileSync(join(process.cwd(), "src", "lib", "account", "deleteAccount.ts"), "utf8");

  it("cancels billing before it destroys anything", () => {
    // Fail closed on money: the unforgivable failure is a workspace that no longer exists and is
    // still being charged, with nothing left in the product to explain it.
    expect(source.indexOf("cancelBilling(orgId)")).toBeLessThan(source.indexOf("purgeOrgRows(orgId)"));
    expect(source.indexOf("cancelBilling(orgId)")).toBeLessThan(
      source.indexOf("releaseVapiResources(orgId)")
    );
  });

  it("deletes the auth user last", () => {
    // The only irreversible step, and the one that makes a retry impossible: once the user is
    // gone, nobody can sign in to finish a half-done deletion.
    expect(source.indexOf("purgeOrgRows(orgId)")).toBeLessThan(
      source.indexOf("auth.admin.deleteUser")
    );
  });

  it("aborts rather than continuing when the subscription will not cancel", () => {
    const billingBlock = source.slice(
      source.indexOf("const billing = await cancelBilling(orgId)"),
      source.indexOf("// 2) Stop the AI answering")
    );
    expect(billingBlock).toMatch(/return\s*\{\s*\n?\s*ok: false/);
  });

  it("clears the workspace's stored files as well as its rows", () => {
    expect(ORG_PREFIXED_BUCKETS).toContain("channel-media");
    expect(ORG_PREFIXED_BUCKETS).toContain("knowledge-documents");
    expect(source).toContain("deleteStoredFiles(orgId)");
  });
});

describe("the action in front of it", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "app", "(app)", "dashboard", "settings", "_actions", "deleteAccount.ts"),
    "utf8"
  );

  it("checks the typed email against the account, not against a constant", () => {
    expect(source).toContain("parsed.data.confirmEmail.trim().toLowerCase() !== email");
  });

  it("re-authenticates a password account", () => {
    expect(source).toContain("verifyPassword(email, password)");
    expect(source).toContain("accountHasPassword(user)");
  });

  it("never takes the scope from the request", () => {
    // `deleteMyAccount` accepts a confirmation and nothing else; what gets deleted is re-derived
    // inside `deleteAccount()` from the database.
    expect(source).not.toMatch(/input\.scope|parsed\.data\.scope/);
  });

  it("clears the session cookies once the user is gone", () => {
    expect(source).toContain("GATE_COOKIE_NAME");
    expect(source).toContain('c.name.startsWith("sb-")');
  });
});
