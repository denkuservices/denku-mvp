import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Channel } from "@/lib/platform/channels";

/**
 * Contact resolution for the shared platform model (Sprint 4.5).
 *
 * `ensureContact` idempotently maps a channel-native identity (a phone number, an IG
 * user id, later an email/WhatsApp number) to a single channel-agnostic Contact, so the
 * same person is one Contact across channels. Idempotency is anchored on the DB unique
 * index `contact_identities (org_id, channel, external_id)` — concurrent webhooks that
 * see the same caller resolve to the same Contact.
 *
 * Org-scoped throughout (every query carries org_id — service-role client has no RLS net).
 * Never throws for the caller's benefit inside the webhook hot path: on failure it
 * returns null and logs, so the legacy path is unaffected.
 */

const PG_UNIQUE_VIOLATION = "23505";

export interface EnsureContactInput {
  orgId: string;
  channel: Channel;
  /** Channel-native identity: E.164 phone (voice), ig_user_id (instagram), email, … */
  externalId: string;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
}

/**
 * Resolve (or create) the Contact for a channel identity. Idempotent.
 * Returns the contact id, or null if resolution failed (caller degrades gracefully).
 */
export async function ensureContact(
  input: EnsureContactInput,
  db: SupabaseClient = supabaseAdmin
): Promise<string | null> {
  const { orgId, channel, externalId } = input;
  if (!orgId || !channel || !externalId) return null;

  try {
    // 1) Existing identity → existing contact.
    const existing = await db
      .from("contact_identities")
      .select("contact_id")
      .eq("org_id", orgId)
      .eq("channel", channel)
      .eq("external_id", externalId)
      .maybeSingle<{ contact_id: string }>();

    if (existing.data?.contact_id) return existing.data.contact_id;

    // 2) Create the contact.
    const insertContact = await db
      .from("contacts")
      .insert({
        org_id: orgId,
        display_name: input.displayName ?? null,
        primary_phone: input.phone ?? null,
        primary_email: input.email ?? null,
      })
      .select("id")
      .single<{ id: string }>();

    if (insertContact.error || !insertContact.data) {
      console.error("[PLATFORM][CONTACT][INSERT][FAILED]", insertContact.error?.message);
      return null;
    }

    const contactId = insertContact.data.id;

    // 3) Link the identity. On a race (another writer created it first) the unique index
    //    rejects with 23505 — re-select the winning contact and drop our orphan contact.
    const linkIdentity = await db
      .from("contact_identities")
      .insert({ org_id: orgId, contact_id: contactId, channel, external_id: externalId });

    if (linkIdentity.error) {
      if ((linkIdentity.error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        const winner = await db
          .from("contact_identities")
          .select("contact_id")
          .eq("org_id", orgId)
          .eq("channel", channel)
          .eq("external_id", externalId)
          .maybeSingle<{ contact_id: string }>();
        // Best-effort cleanup of the losing contact row (non-fatal).
        await db.from("contacts").delete().eq("id", contactId).eq("org_id", orgId);
        return winner.data?.contact_id ?? null;
      }
      console.error("[PLATFORM][CONTACT][IDENTITY][FAILED]", linkIdentity.error.message);
      return null;
    }

    return contactId;
  } catch (err) {
    console.error("[PLATFORM][CONTACT][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}
