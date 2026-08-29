import { randomBytes } from "node:crypto";

/**
 * The address we issue for a customer to forward their published mailbox to.
 *
 * Shape: `<slug>-<random>@<inbound domain>` — e.g. `acme-a7f31c@in.denku.io`.
 *
 * The slug is there so a human reading their own mail settings can tell what the rule is for;
 * the random suffix is there so two workspaces called "Acme" do not collide, and so the address
 * is not guessable from the business name alone. That unguessability is a courtesy, NOT a
 * security control: an email address is public by nature, and inbound is authenticated by the
 * provider's webhook signature. Nothing may ever depend on this string being secret.
 */

/** Env shape these helpers read, kept loose so tests can pass a bare object (as flags.ts does). */
export type AddressEnv = Record<string, string | undefined>;

/** Where forwarded mail is received. No default — an unset domain must fail loudly. */
export function inboundDomain(env: AddressEnv = process.env): string | null {
  const domain = (env.EMAIL_INBOUND_DOMAIN ?? "").trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

/** Reduce a workspace name to something that is legal and readable in an address local part. */
export function slugifyForAddress(name: string | null | undefined): string {
  const base = (name ?? "")
    .normalize("NFKD")
    // Turkish and other diacritics reduce to their ASCII stems rather than vanishing, so
    // "Şişli Kuaför" becomes "sisli-kuafor" and not "sl-kuafr".
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");

  return base.length > 0 ? base : "inbox";
}

/** Build a fresh inbound address for an org. Returns null when no inbound domain is set. */
export function buildInboundAddress(
  workspaceName: string | null | undefined,
  env: AddressEnv = process.env
): string | null {
  const domain = inboundDomain(env);
  if (!domain) return null;
  return `${slugifyForAddress(workspaceName)}-${randomBytes(3).toString("hex")}@${domain}`;
}
