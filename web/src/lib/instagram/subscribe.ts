import "server-only";
import { getConnectionSecret, recordSubscriptionResult } from "./connections";
import { subscribeAppToWebhooks } from "./client";

/**
 * Webhook subscription for a connected Instagram account (Sprint 1.5 fix). After
 * OAuth, the app must subscribe the account via `/subscribed_apps` or Meta delivers
 * nothing. We subscribe only to fields the granted scopes actually back (requesting a
 * field without its scope would fail the whole call), then record the result in `meta`.
 */

/** Map granted OAuth scopes → the webhook fields we're allowed to subscribe to. */
export function subscribedFieldsForScopes(scopes: string[] | null | undefined): string[] {
  const s = new Set(scopes ?? []);
  const fields: string[] = [];
  if (s.has("instagram_business_manage_messages")) fields.push("messages");
  if (s.has("instagram_business_manage_comments")) fields.push("comments");
  return fields;
}

/**
 * Subscribe one org's connected account to its scope-backed webhook fields.
 * Idempotent (Meta's subscribe is upsert-like) and safe to run repeatedly — this is
 * what both the OAuth callback and the backfill endpoint call.
 */
export async function subscribeInstagramAccount(
  orgId: string
): Promise<{ ok: boolean; fields: string[]; error?: string }> {
  const secret = await getConnectionSecret(orgId);
  if (!secret) return { ok: false, fields: [], error: "no_connection" };

  const fields = subscribedFieldsForScopes(secret.scopes);
  if (fields.length === 0) return { ok: false, fields: [], error: "no_subscribable_scopes" };

  const res = await subscribeAppToWebhooks(secret.igUserId, secret.accessToken, fields);
  await recordSubscriptionResult(orgId, { ok: res.ok, fields, error: res.error });
  return { ok: res.ok, fields, error: res.error };
}
