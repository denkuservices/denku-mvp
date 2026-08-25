import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  return (
    <AccountSecurityClient
      email={userEmail ?? "—"}
      isPasswordManagedByProvider={isPasswordManagedByProvider}
      providerLabel={providerLabel}
    />
  );
}
