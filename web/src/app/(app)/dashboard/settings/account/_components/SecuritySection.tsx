import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listSessions } from "../../_actions/security";
import { AccountSecurityClient } from "../security/_components/AccountSecurityClient";

/**
 * Security — the "how do I sign in" half of Account. Moved out of `account/security/page.tsx`.
 *
 * Password management only applies when the account actually has a password: a Google or Facebook
 * sign-in is managed by that provider, and offering a password form for it would be a control that
 * cannot work.
 */
export default async function SecuritySection() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userEmail = auth?.user?.email ?? null;

  let isPasswordManagedByProvider = true;
  let providerLabel = "Identity provider";

  if (auth?.user) {
    const identities = (auth.user as { identities?: Array<{ provider?: string }> }).identities ?? [];
    const emailIdentity = identities.find((id) => id.provider === "email");

    if (emailIdentity) {
      isPasswordManagedByProvider = false;
      providerLabel = "Email";
    } else if (identities.length > 0) {
      const oauthProvider = identities[0].provider ?? "provider";
      providerLabel = oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1);
    } else {
      const provider =
        (auth.user as { app_metadata?: { provider?: string } }).app_metadata?.provider || "email";
      if (provider === "email") {
        isPasswordManagedByProvider = false;
        providerLabel = "Email";
      } else {
        providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
      }
    }
  }

  // Sessions live in `auth.sessions`, which the browser cannot reach — resolved here and passed
  // down. Returns an empty list rather than throwing if the migration has not been applied yet.
  const sessions = await listSessions();

  /**
   * Enrolled second factors, read on the server so the card is correct on first paint.
   *
   * Best-effort: an auth backend that cannot answer must not take the whole Security section down
   * with it, and the card degrades to "off" — which is what its own controls would then correct.
   */
  let mfaFactors: Array<{ id: string; friendlyName: string | null; status: string }> = [];
  try {
    const { data } = await supabase.auth.mfa.listFactors();
    mfaFactors = (data?.all ?? []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? null,
      status: f.status,
    }));
  } catch {
    /* leave empty */
  }

  return (
    <AccountSecurityClient
      email={userEmail ?? "—"}
      isPasswordManagedByProvider={isPasswordManagedByProvider}
      providerLabel={providerLabel}
      sessions={sessions}
      mfaFactors={mfaFactors}
    />
  );
}
