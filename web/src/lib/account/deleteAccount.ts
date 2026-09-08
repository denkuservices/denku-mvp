import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViewer, type Viewer } from "@/lib/auth/permissions";
import { countOwners } from "@/lib/members/roster";
import { vapiFetch } from "@/lib/vapi/server";
import { deleteWebhook } from "@/lib/telegram/api";
import { getBotToken } from "@/lib/telegram/connections";
import { logEvent } from "@/lib/observability/logEvent";
import { ORG_PREFIXED_BUCKETS, ORG_SCOPED_TABLES } from "@/lib/account/orgTables";

/**
 * Closing an account for good.
 *
 * **What "delete my account" has to mean.** A customer clicking this is asking for two different
 * things depending on who they are, and conflating them would either destroy a business's data on
 * a colleague's say-so or leave a paying subscription running after the last owner walked away:
 *
 *   - **The sole owner** is the workspace. Their account going means the workspace goes: the
 *     subscription is cancelled, the phone numbers are released, the channels are disconnected and
 *     every row is deleted. Anyone else in it keeps their own Denku account and loses this
 *     workspace — the same thing that happens when an owner removes a member.
 *   - **Anyone else** — a viewer, an admin, an owner with a co-owner — is a person in a workspace
 *     that outlives them. Their account goes; the business's data does not.
 *
 * The scope is decided here, from the database, and named on the confirmation dialog before
 * anything happens. It is never taken from the request.
 *
 * **The order is the whole design.** Money first, then the things that answer a customer, then the
 * data, then the account:
 *
 *   1. **Stripe is cancelled before anything is destroyed**, and a failure there ABORTS with the
 *      workspace still intact. This is the house rule — fail closed on money. The other order
 *      (delete, then try to cancel) has one failure mode and it is unforgivable: a business that
 *      no longer exists, still being charged, with nothing left in the product to show them why.
 *   2. **Vapi, Telegram and stored files are best-effort.** They are already paid for and already
 *      cancelled; a released number that Vapi did not acknowledge is a cleanup job, not a reason
 *      to refuse someone their deletion. Every failure is returned as a warning and logged.
 *   3. **The rows go in one transaction** via `purge_org_data`, with a sequential fallback for a
 *      deployment where that migration has not been applied yet.
 *   4. **The auth user goes last**, because it is the only step that cannot be retried: once the
 *      user is gone nobody can sign in to finish a half-done deletion.
 */

export type DeletionScope = "workspace_and_account" | "account_only";

export interface AccountDeletionPreview {
  /** The email the customer must type back to confirm — always their own. */
  email: string | null;
  scope: DeletionScope;
  /** False for a Google/Facebook account: there is no Denku password to re-authenticate with. */
  requiresPassword: boolean;
  workspaceName: string | null;
  /** People other than this one who will lose access when the workspace goes. */
  otherMembers: number;
  /** E.164 numbers that will be released. Shown in full: they belong to the person reading. */
  phoneNumbers: string[];
  /** True when there is a Stripe customer for this workspace — i.e. money may be involved. */
  hasBilling: boolean;
  counts: {
    conversations: number;
    calls: number;
    tickets: number;
    appointments: number;
    contacts: number;
  };
}

const EMPTY_COUNTS = { conversations: 0, calls: 0, tickets: 0, appointments: 0, contacts: 0 };

/**
 * Whether this account has a Denku password at all.
 *
 * A Google or Facebook sign-in has no password here, so demanding one would be a confirmation
 * nobody could satisfy. Mirrors the rule `SecuritySection` already applies to the password form.
 */
export function accountHasPassword(
  user: {
    identities?: Array<{ provider?: string }> | null;
    app_metadata?: { provider?: string } | null;
  } | null
): boolean {
  if (!user) return false;
  const identities = user.identities ?? [];
  if (identities.length > 0) return identities.some((i) => i.provider === "email");
  return (user.app_metadata?.provider ?? "email") === "email";
}

/** What the confirmation dialog tells the customer will happen. Read-only. */
export async function previewAccountDeletion(
  viewer: Viewer,
  hasPassword: boolean
): Promise<AccountDeletionPreview> {
  const base: AccountDeletionPreview = {
    email: viewer.email,
    scope: "account_only",
    requiresPassword: hasPassword,
    workspaceName: null,
    otherMembers: 0,
    phoneNumbers: [],
    hasBilling: false,
    counts: { ...EMPTY_COUNTS },
  };

  if (!viewer.orgId) return base;

  const scope = await resolveScope(viewer);
  if (scope === "account_only") {
    // Their colleagues' data is not theirs to preview, let alone delete.
    return { ...base, scope };
  }

  const orgId = viewer.orgId;
  const [org, members, lines, stripeCustomer, counts] = await Promise.all([
    supabaseAdmin.from("orgs").select("name").eq("id", orgId).maybeSingle<{ name: string | null }>(),
    supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .neq("id", viewer.profileId ?? "00000000-0000-0000-0000-000000000000"),
    supabaseAdmin.from("phone_lines").select("phone_number_e164").eq("org_id", orgId),
    supabaseAdmin
      .from("billing_stripe_customers")
      .select("stripe_customer_id")
      .eq("org_id", orgId)
      .maybeSingle<{ stripe_customer_id: string | null }>(),
    countWorkspaceRecords(orgId),
  ]);

  return {
    ...base,
    scope,
    workspaceName: org.data?.name ?? null,
    otherMembers: members.count ?? 0,
    phoneNumbers: ((lines.data ?? []) as Array<{ phone_number_e164: string | null }>)
      .map((l) => l.phone_number_e164)
      .filter((n): n is string => Boolean(n)),
    hasBilling: Boolean(stripeCustomer.data?.stripe_customer_id),
    counts,
  };
}

/**
 * Does this person's account take the workspace with it?
 *
 * Only when they are its **last owner**. An owner with a co-owner leaves a workspace that still
 * has someone who can pay for it, so their account is the only thing that goes — which is also
 * the escape hatch the confirmation copy points at: make someone else an owner first.
 */
async function resolveScope(viewer: Viewer): Promise<DeletionScope> {
  if (!viewer.orgId) return "account_only";
  if (viewer.role !== "owner") return "account_only";
  const owners = await countOwners(viewer.orgId);
  return owners > 1 ? "account_only" : "workspace_and_account";
}

async function countWorkspaceRecords(orgId: string) {
  const head = (table: string) =>
    supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("org_id", orgId);

  const [conversations, calls, tickets, appointments, contacts] = await Promise.all([
    head("conversations"),
    head("calls"),
    head("tickets"),
    head("appointments"),
    head("contacts"),
  ]);

  return {
    conversations: conversations.count ?? 0,
    calls: calls.count ?? 0,
    tickets: tickets.count ?? 0,
    appointments: appointments.count ?? 0,
    contacts: contacts.count ?? 0,
  };
}

export type DeleteAccountResult =
  | { ok: true; scope: DeletionScope; warnings: string[] }
  | { ok: false; error: string };

/**
 * Do it.
 *
 * The caller has already re-authenticated the person and checked the typed confirmation; this
 * function re-reads the viewer and re-derives the scope rather than trusting either.
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const viewer = await getViewer();
  if (!viewer.userId) return { ok: false, error: "Unauthorized" };

  const scope = await resolveScope(viewer);
  const orgId = viewer.orgId;
  const warnings: string[] = [];

  logEvent({
    tag: "[ACCOUNT][DELETE][START]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: { scope, user_id: viewer.userId, role: viewer.role },
  });

  if (scope === "workspace_and_account" && orgId) {
    // 1) Money first, and fail closed. Nothing below this line is reversible.
    const billing = await cancelBilling(orgId);
    if (!billing.ok) {
      logEvent({
        tag: "[ACCOUNT][DELETE][BILLING][FAILED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { error: billing.error },
      });
      return {
        ok: false,
        error:
          "We could not cancel your subscription, so nothing was deleted. Your account is unchanged — please try again or contact support.",
      };
    }

    // 2) Stop the AI answering anyone, and hand back what we rent on the customer's behalf.
    warnings.push(...(await releaseVapiResources(orgId)));
    warnings.push(...(await disconnectTelegramBots(orgId)));
    warnings.push(...(await deleteStoredFiles(orgId)));

    // 3) The rows.
    const purged = await purgeOrgRows(orgId);
    if (!purged.ok) {
      logEvent({
        tag: "[ACCOUNT][DELETE][PURGE][FAILED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "error",
        details: { error: purged.error },
      });
      return {
        ok: false,
        error:
          "Your subscription was cancelled but the workspace could not be fully deleted. Please try again — you will not be charged in the meantime.",
      };
    }
  } else if (orgId && viewer.profileId) {
    // Leaving a workspace that outlives you: detach the membership, keep the business's data.
    await supabaseAdmin
      .from("profiles")
      .update({ org_id: null, role: "viewer", updated_at: new Date().toISOString() })
      .eq("id", viewer.profileId);
  }

  /*
   * 4) The profile row, then the identity.
   *
   * Keyed the two ways this repo stores a person (CLAUDE.md landmine #4/#16) so a workspace where
   * the two diverge still ends up clean. The id is about to be interpolated into PostgREST's
   * filter grammar on the service-role client, so anything that is not a plain UUID is refused
   * rather than sent — the same guard `getViewer` applies, for the same reason.
   */
  if (/^[0-9a-fA-F-]{36}$/.test(viewer.userId)) {
    const profileDelete = await supabaseAdmin
      .from("profiles")
      .delete()
      .or(`id.eq.${viewer.userId},auth_user_id.eq.${viewer.userId}`);
    if (profileDelete.error) warnings.push("Profile record could not be removed.");
  } else {
    warnings.push("Profile record could not be removed.");
  }

  const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(viewer.userId);
  if (authError) {
    logEvent({
      tag: "[ACCOUNT][DELETE][AUTH][FAILED]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "error",
      details: { error: authError.message },
    });
    return {
      ok: false,
      error:
        "Your workspace data was deleted but the sign-in account could not be removed. Please contact support so we can finish it.",
    };
  }

  logEvent({
    tag: "[ACCOUNT][DELETE][OK]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: { scope, warnings },
  });

  return { ok: true, scope, warnings };
}

/* ------------------------------------------------------------------ billing */

/**
 * Cancel every live subscription on this workspace's Stripe customer, immediately.
 *
 * The customer OBJECT is deliberately kept. Invoices already raised are accounting records — a
 * refund, a chargeback or a tax return can need them months after the workspace is gone, and
 * deleting the customer would take the payment history with it. What is cancelled is the thing
 * that would keep charging.
 *
 * "No Stripe customer" is a success, not an error: a workspace that never bought anything has
 * nothing to cancel.
 */
async function cancelBilling(orgId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("billing_stripe_customers")
    .select("stripe_customer_id")
    .eq("org_id", orgId)
    .maybeSingle<{ stripe_customer_id: string | null }>();

  if (error) return { ok: false, error: `Could not read billing record: ${error.message}` };

  const customerId = data?.stripe_customer_id ?? null;
  if (!customerId) return { ok: true };

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    // A workspace with a Stripe customer and no key configured is an environment that cannot
    // honestly promise "you will not be charged again". Refuse rather than guess.
    return { ok: false, error: "Stripe is not configured on this deployment" };
  }

  try {
    /*
     * Imported here, not at the top of the file.
     *
     * The Account settings PAGE imports `previewAccountDeletion` and `accountHasPassword` from
     * this module, so a top-level `import Stripe from "stripe"` pulls the whole Stripe SDK into a
     * settings page that never charges anything. Only this one function has ever needed it.
     */
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });

    for (const sub of subs.data) {
      if (sub.status === "canceled" || sub.status === "incomplete_expired") continue;
      await stripe.subscriptions.cancel(sub.id);
      logEvent({
        tag: "[ACCOUNT][DELETE][BILLING][CANCELLED]",
        ts: Date.now(),
        stage: "COST",
        source: "system",
        org_id: orgId,
        severity: "warn",
        details: { subscription_id: sub.id, previous_status: sub.status },
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/* --------------------------------------------------------------------- vapi */

/**
 * Give back the phone numbers, assistants and SIP credentials this workspace rents.
 *
 * Best-effort by design — see the header. Numbers are released BEFORE assistants so that, if the
 * process dies in the middle, what is left behind is an assistant nobody can reach rather than a
 * live number pointing at nothing.
 */
async function releaseVapiResources(orgId: string): Promise<string[]> {
  const warnings: string[] = [];
  if (!process.env.VAPI_API_KEY) return warnings;

  const drop = async (path: string, label: string) => {
    try {
      await vapiFetch(path, { method: "DELETE" });
    } catch (err) {
      // A 404 means it is already gone, which is the state we wanted.
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("404")) warnings.push(`${label} could not be released.`);
      console.warn("[ACCOUNT][DELETE][VAPI][FAILED]", { path, message });
    }
  };

  const [lines, agents, org] = await Promise.all([
    supabaseAdmin.from("phone_lines").select("vapi_phone_number_id").eq("org_id", orgId),
    supabaseAdmin
      .from("agents")
      .select("vapi_assistant_id, vapi_phone_number_id")
      .eq("org_id", orgId),
    supabaseAdmin
      .from("orgs")
      .select("vapi_assistant_id, vapi_phone_number_id")
      .eq("id", orgId)
      .maybeSingle<{ vapi_assistant_id: string | null; vapi_phone_number_id: string | null }>(),
  ]);

  const numberIds = new Set<string>();
  const assistantIds = new Set<string>();

  for (const l of (lines.data ?? []) as Array<{ vapi_phone_number_id: string | null }>) {
    if (l.vapi_phone_number_id) numberIds.add(l.vapi_phone_number_id);
  }
  for (const a of (agents.data ?? []) as Array<{
    vapi_assistant_id: string | null;
    vapi_phone_number_id: string | null;
  }>) {
    if (a.vapi_phone_number_id) numberIds.add(a.vapi_phone_number_id);
    if (a.vapi_assistant_id) assistantIds.add(a.vapi_assistant_id);
  }
  // The pre-`agents` era put both on the org row itself. Still true for the oldest workspaces.
  if (org.data?.vapi_phone_number_id) numberIds.add(org.data.vapi_phone_number_id);
  if (org.data?.vapi_assistant_id) assistantIds.add(org.data.vapi_assistant_id);

  for (const id of numberIds) await drop(`/phone-number/${id}`, "A phone number");
  for (const id of assistantIds) await drop(`/assistant/${id}`, "An AI assistant");

  const { data: trunks } = await supabaseAdmin
    .from("sip_trunks")
    .select("vapi_credential_id")
    .eq("org_id", orgId);
  for (const t of (trunks ?? []) as Array<{ vapi_credential_id: string | null }>) {
    if (t.vapi_credential_id) await drop(`/credential/${t.vapi_credential_id}`, "A SIP credential");
  }

  return warnings;
}

/* ----------------------------------------------------------------- telegram */

/**
 * Point every connected bot away from us.
 *
 * Without this, a customer's BotFather bot keeps POSTing updates at a webhook whose connection row
 * is gone. It would answer nobody — the route refuses an unknown connection — but Telegram would
 * keep retrying for a bot the person may well reuse elsewhere, so we hand the token back cleanly
 * while we still hold it.
 */
async function disconnectTelegramBots(orgId: string): Promise<string[]> {
  const warnings: string[] = [];
  const { data } = await supabaseAdmin.from("telegram_connections").select("id").eq("org_id", orgId);

  for (const row of (data ?? []) as Array<{ id: string }>) {
    try {
      const token = await getBotToken(row.id);
      if (!token) continue;
      const removed = await deleteWebhook(token);
      if (!removed.ok) warnings.push("A Telegram bot webhook could not be removed.");
    } catch {
      warnings.push("A Telegram bot webhook could not be removed.");
    }
  }
  return warnings;
}

/* ------------------------------------------------------------------ storage */

/**
 * Remove the customer photos, voice notes and uploaded documents.
 *
 * Both buckets key every object as `<org id>/…` precisely so this is a prefix walk rather than a
 * query — see `lib/platform/media/store.ts`. Listing is paged and recursive because the media
 * bucket nests one more level (`<org>/<conversation>/<file>`).
 */
async function deleteStoredFiles(orgId: string): Promise<string[]> {
  const warnings: string[] = [];

  for (const bucket of ORG_PREFIXED_BUCKETS) {
    try {
      const keys = await listKeys(bucket, orgId);
      for (let i = 0; i < keys.length; i += 100) {
        const { error } = await supabaseAdmin.storage.from(bucket).remove(keys.slice(i, i + 100));
        if (error) {
          warnings.push("Some stored files could not be deleted.");
          break;
        }
      }
    } catch {
      warnings.push("Some stored files could not be deleted.");
    }
  }

  return warnings;
}

async function listKeys(bucket: string, prefix: string, depth = 0): Promise<string[]> {
  // Three levels is one more than either bucket uses; the guard is here so a malformed key can
  // never turn a cleanup into an unbounded walk.
  if (depth > 3) return [];

  const out: string[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset });
    if (error || !data || data.length === 0) break;

    for (const entry of data) {
      const key = `${prefix}/${entry.name}`;
      // Supabase returns folders as rows with no `id`.
      if (entry.id) out.push(key);
      else out.push(...(await listKeys(bucket, key, depth + 1)));
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  return out;
}

/* --------------------------------------------------------------------- rows */

/**
 * Empty every tenant table for this workspace, then remove the workspace.
 *
 * `purge_org_data` does it in one transaction. The fallback exists because that migration may not
 * be applied on a given deployment yet, and a customer's right to delete their data should not
 * wait on an operator: it walks the same list in the same order, one statement at a time. It is
 * not atomic — a failure part way leaves a partly-emptied workspace the customer can delete again
 * — which is why it is the fallback and not the design.
 */
async function purgeOrgRows(orgId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const rpc = await supabaseAdmin.rpc("purge_org_data", { p_org_id: orgId });

  if (!rpc.error) {
    logEvent({
      tag: "[ACCOUNT][DELETE][PURGE][OK]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: orgId,
      severity: "warn",
      details: { counts: rpc.data as Record<string, number> | null, path: "rpc" },
    });
    return { ok: true };
  }

  const missing =
    rpc.error.code === "PGRST202" ||
    rpc.error.code === "42883" ||
    /could not find the function|does not exist/i.test(rpc.error.message ?? "");

  if (!missing) return { ok: false, error: rpc.error.message };

  console.warn("[ACCOUNT][DELETE][PURGE][FALLBACK]", { reason: rpc.error.message });

  for (const table of ORG_SCOPED_TABLES) {
    const { error } = await supabaseAdmin.from(table).delete().eq("org_id", orgId);
    // A table this deployment does not have yet is not a reason to strand a deletion.
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: `${table}: ${error.message}` };
    }
  }

  const detach = await supabaseAdmin
    .from("profiles")
    .update({ org_id: null, role: "viewer", updated_at: new Date().toISOString() })
    .eq("org_id", orgId);
  if (detach.error) return { ok: false, error: `profiles: ${detach.error.message}` };

  const org = await supabaseAdmin.from("orgs").delete().eq("id", orgId);
  if (org.error) return { ok: false, error: `orgs: ${org.error.message}` };

  logEvent({
    tag: "[ACCOUNT][DELETE][PURGE][OK]",
    ts: Date.now(),
    stage: "COST",
    source: "system",
    org_id: orgId,
    severity: "warn",
    details: { path: "fallback" },
  });

  return { ok: true };
}
