import { KeyRound, Mail, ShieldCheck, UserRound } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import Avatar from "@/app/(app)/dashboard/_platform/Avatar";
import {
  Panel,
  SettingsHero,
  SettingsSection,
  StatusPill,
} from "@/app/(app)/dashboard/_platform/settings/ui";
import ProfileSection from "./_components/ProfileSection";
import SecuritySection from "./_components/SecuritySection";

export const dynamic = "force-dynamic";

/**
 * Account — one page, two sections (Settings 9 → 4).
 *
 * Profile and Security were two routes with two tab links inside a layout of their own, for two
 * short cards that answer the same question: *my* details, as opposed to the workspace's. That put
 * three navigation layers between a customer and their password — the product nav, the settings
 * rail, and a tab strip — so both are sections here and the old routes redirect.
 *
 * **The visual pass** gave the page a subject. It opened with the word "Account" over two grey
 * headings; the person whose account it is appeared nowhere, even though the same avatar treatment
 * already anchors every contact and conversation in the product. The header now shows who you are
 * signed in as and how — the sign-in method matters, because it decides whether the password form
 * below is a real control or an explanation that your identity provider owns it.
 */
export default async function AccountSettingsPage() {
  const supabase = await createSupabaseServerClient();
  const auth = { user: await getCachedUser() };
  const user = auth?.user ?? null;
  const email = user?.email ?? null;

  let fullName: string | null = null;
  if (user?.id) {
    // Read-only and by `auth_user_id` — the header must never be the thing that repairs a profile
    // row. `ProfileSection` owns the self-healing lookup (CLAUDE.md landmine #4).
    const { data } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ full_name: string | null }>();
    fullName = data?.full_name ?? null;
  }

  // Which identity actually signs this person in — the same rule `SecuritySection` applies.
  const identities = (user as { identities?: Array<{ provider?: string }> } | null)?.identities ?? [];
  const provider =
    identities.find((i) => i.provider === "email")?.provider ??
    identities[0]?.provider ??
    (user as { app_metadata?: { provider?: string } } | null)?.app_metadata?.provider ??
    "email";
  const providerLabel =
    provider === "email" ? "Email & password" : provider.charAt(0).toUpperCase() + provider.slice(1);

  const displayName = fullName?.trim() || email || "Your account";

  return (
    <div className="space-y-8">
      <SettingsHero
        icon={UserRound}
        badge={<Avatar name={fullName || email} seed={user?.id ?? email} size="lg" />}
        title={displayName}
        subtitle="Your details and how you sign in."
        pills={
          <>
            {email ? (
              <StatusPill tone="neutral" icon={Mail}>
                {email}
              </StatusPill>
            ) : null}
            <StatusPill tone="info" icon={KeyRound}>
              {providerLabel}
            </StatusPill>
          </>
        }
      />

      <SettingsSection
        id="profile"
        icon={UserRound}
        title="Profile"
        hint="How you appear to the rest of your workspace."
      >
        <Panel>
          <ProfileSection />
        </Panel>
      </SettingsSection>

      <SettingsSection
        id="security"
        icon={ShieldCheck}
        title="Security"
        hint="Your password and where you are signed in."
      >
        <SecuritySection />
      </SettingsSection>
    </div>
  );
}
