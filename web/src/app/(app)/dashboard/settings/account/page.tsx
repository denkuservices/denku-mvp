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
 */
function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-navy-700 dark:text-white">{title}</h2>
        {hint ? <p className="mt-0.5 text-sm text-gray-500">{hint}</p> : null}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-navy-800">
        {children}
      </div>
    </section>
  );
}

export default function AccountSettingsPage() {
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-navy-700 dark:text-white">Account</h1>
        <p className="mt-1 text-sm text-gray-500">Your details and how you sign in.</p>
      </div>

      <Section id="profile" title="Profile">
        <ProfileSection />
      </Section>

      <Section id="security" title="Security">
        <SecuritySection />
      </Section>
    </div>
  );
}
