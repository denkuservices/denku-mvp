import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AccountSecurityClient } from "./_components/AccountSecurityClient";

export default async function AccountSecurityPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userEmail = auth?.user?.email ?? null;

  // Determine provider
  let isPasswordManagedByProvider = true;
  let providerLabel = "Identity provider";

  if (auth?.user) {
    // Check identities array (preferred method)
    const identities = (auth.user as any).identities || [];
    const emailIdentity = identities.find((id: any) => id.provider === "email");
    
    if (emailIdentity) {
      isPasswordManagedByProvider = false;
      providerLabel = "Email";
    } else if (identities.length > 0) {
      const oauthProvider = identities[0].provider;
      providerLabel = oauthProvider.charAt(0).toUpperCase() + oauthProvider.slice(1);
    } else {
      // Fallback: check app_metadata
      const provider = (auth.user as any).app_metadata?.provider || "email";
      if (provider === "email") {
        isPasswordManagedByProvider = false;
        providerLabel = "Email";
      } else {
        providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm space-y-6">
      <AccountSecurityClient
        email={userEmail ?? "—"}
        isPasswordManagedByProvider={isPasswordManagedByProvider}
        providerLabel={providerLabel}
      />
    </div>
  );
}
