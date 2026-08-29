import "server-only";

import { resend } from "@/lib/email/resend";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { SendingDomainStatus } from "@/lib/email/channel/connections";
import { normalizeDomain } from "@/lib/email/channel/rules";

// Re-exported so existing importers keep one obvious place to look; the logic lives in the pure
// module so tests can reach it without a Supabase client.
export { normalizeDomain, addressBelongsToDomain } from "@/lib/email/channel/rules";

/**
 * Per-org sending domains.
 *
 * This is the half of the email channel that decides whether a reply can be sent AS THE
 * BUSINESS. Receiving is solved by forwarding, which asks nothing of DNS; sending is not, and no
 * amount of forwarding grants it. A customer's customer must see `info@theirshop.com`, which
 * means their domain has to carry our DKIM key — there is no shortcut around that, and the
 * shortcut that looks available (send from `denku.io` and set Reply-To) is exactly the
 * over-claim the honesty rules forbid.
 *
 * Denku holds the Resend account, so domain records are created here and the customer only
 * copies DNS entries. `verify` is Resend asking DNS whether they did; it is never a claim we
 * make on our own.
 */

/** One DNS record the customer must add. Safe to render — nothing here is a secret. */
export interface DnsRecord {
  record: string;
  type: string;
  name: string;
  value: string;
  ttl: string;
  priority: number | null;
  status: string;
}

export interface DomainState {
  ok: boolean;
  domainId: string | null;
  status: SendingDomainStatus;
  records: DnsRecord[];
  error?: string;
}

/**
 * Map Resend's domain status onto ours.
 *
 * `temporary_failure` deliberately becomes `pending`, not `failed`: it means Resend could not
 * read DNS this minute, which is a retry, not a customer error. Telling someone their records
 * are wrong when they are merely slow to propagate sends them off to "fix" a correct setup.
 */
function toStatus(raw: string | null | undefined): SendingDomainStatus {
  switch (raw) {
    case "verified":
      return "verified";
    case "failed":
      return "failed";
    case "pending":
    case "temporary_failure":
      return "pending";
    case "not_started":
    default:
      return "unverified";
  }
}

function toRecords(raw: unknown): DnsRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      record: String(rec.record ?? ""),
      type: String(rec.type ?? ""),
      name: String(rec.name ?? ""),
      value: String(rec.value ?? ""),
      ttl: String(rec.ttl ?? "Auto"),
      priority: typeof rec.priority === "number" ? rec.priority : null,
      status: String(rec.status ?? ""),
    };
  });
}

/**
 * Find a domain already registered in the Resend account, by name.
 *
 * Needed because `domains.create` refuses a name the account already holds, and that is not an
 * error from the customer's point of view — it means the work is already done. Denku's own
 * `denku.io` is the first example, but any business whose domain was added for another reason
 * (an earlier connection, a second address, an operator setting it up by hand) hits the same
 * wall. Returns null when the account genuinely does not have it.
 */
async function findExistingDomain(domain: string): Promise<{ id: string; status: string } | null> {
  if (!resend) return null;
  try {
    const listed = await resend.domains.list();
    const rows = (listed.data as { data?: Array<{ id: string; name: string; status: string }> } | null)?.data;
    if (!Array.isArray(rows)) return null;
    const match = rows.find((d) => d.name?.toLowerCase() === domain);
    return match ? { id: match.id, status: match.status } : null;
  } catch (err) {
    console.error("[EMAIL][DOMAIN][LIST][ERROR]", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Register the org's domain with Resend and store what the customer must add to DNS.
 *
 * Idempotent in both directions: re-running for the same connection replaces the stored domain,
 * so a customer who typed the wrong one can simply type the right one — and a domain the Resend
 * account ALREADY holds is adopted rather than rejected.
 */
export async function startDomainVerification(input: {
  orgId: string;
  connectionId: string;
  domain: string;
}): Promise<DomainState> {
  const empty: DomainState = { ok: false, domainId: null, status: "unverified", records: [] };

  const domain = normalizeDomain(input.domain);
  if (!domain) return { ...empty, error: "That does not look like a domain. Try yourshop.com." };

  if (!resend) {
    console.error("[EMAIL][DOMAIN][NOT_CONFIGURED]");
    return { ...empty, error: "Email sending is not configured on this environment." };
  }

  try {
    let domainId: string | null = null;
    let rawStatus: string | null = null;
    let records: DnsRecord[] = [];

    const created = await resend.domains.create({ name: domain });

    if (created.error || !created.data) {
      /**
       * A create that failed is not necessarily a customer error — the commonest cause is that
       * the account already holds this domain. Look before reporting failure, so an
       * already-verified domain lights up green instead of telling the owner to fix DNS that is
       * already correct.
       */
      const existing = await findExistingDomain(domain);
      if (!existing) {
        console.error("[EMAIL][DOMAIN][CREATE][FAILED]", { domain, error: created.error?.message });
        return { ...empty, error: created.error?.message ?? "Could not register that domain." };
      }
      domainId = existing.id;
      rawStatus = existing.status;
      records = await getDomainRecords(existing.id);
      console.info("[EMAIL][DOMAIN][ADOPTED_EXISTING]", { org_id: input.orgId, domain, status: rawStatus });
    } else {
      domainId = created.data.id;
      rawStatus = created.data.status;
      records = toRecords((created.data as { records?: unknown }).records);
    }

    const status = toStatus(rawStatus);

    const { error } = await supabaseAdmin
      .from("email_connections")
      .update({
        sending_domain: domain,
        sending_domain_status: status,
        resend_domain_id: domainId,
        // Cleared deliberately: a from-address that belonged to the previous domain must not
        // survive a domain change and quietly become unsendable.
        from_address: null,
      })
      .eq("id", input.connectionId)
      .eq("org_id", input.orgId);

    if (error) {
      console.error("[EMAIL][DOMAIN][SAVE][FAILED]", error.message);
      return { ...empty, error: "Could not save the domain. Please try again." };
    }

    console.info("[EMAIL][DOMAIN][READY]", { org_id: input.orgId, domain, status });
    return { ok: true, domainId, status, records };
  } catch (err) {
    console.error("[EMAIL][DOMAIN][CREATE][ERROR]", err instanceof Error ? err.message : String(err));
    return { ...empty, error: "Could not reach the email provider. Please try again." };
  }
}

/**
 * Ask Resend to re-read DNS, then record the answer.
 *
 * The stored status is only ever what the provider just said — we never infer "probably verified
 * by now". A business that believes its domain is verified when it is not discovers the truth
 * through a customer who never received a reply.
 */
export async function refreshDomainStatus(input: {
  orgId: string;
  connectionId: string;
  domainId: string;
}): Promise<DomainState> {
  const empty: DomainState = { ok: false, domainId: input.domainId, status: "unverified", records: [] };

  if (!resend) return { ...empty, error: "Email sending is not configured on this environment." };

  try {
    // `verify` kicks off a check; `get` reports where it landed and returns the records with
    // their individual states, which is what tells a customer WHICH row they got wrong.
    await resend.domains.verify(input.domainId).catch(() => undefined);
    const fetched = await resend.domains.get(input.domainId);

    if (fetched.error || !fetched.data) {
      return { ...empty, error: fetched.error?.message ?? "Could not check the domain." };
    }

    const status = toStatus(fetched.data.status);
    const records = toRecords((fetched.data as { records?: unknown }).records);

    await supabaseAdmin
      .from("email_connections")
      .update({ sending_domain_status: status })
      .eq("id", input.connectionId)
      .eq("org_id", input.orgId);

    console.info("[EMAIL][DOMAIN][CHECKED]", { org_id: input.orgId, status });
    return { ok: true, domainId: input.domainId, status, records };
  } catch (err) {
    console.error("[EMAIL][DOMAIN][VERIFY][ERROR]", err instanceof Error ? err.message : String(err));
    return { ...empty, error: "Could not reach the email provider. Please try again." };
  }
}

/** Read the DNS records to show, without triggering a verification round trip. */
export async function getDomainRecords(domainId: string): Promise<DnsRecord[]> {
  if (!resend || !domainId) return [];
  try {
    const fetched = await resend.domains.get(domainId);
    if (fetched.error || !fetched.data) return [];
    return toRecords((fetched.data as { records?: unknown }).records);
  } catch {
    return [];
  }
}
