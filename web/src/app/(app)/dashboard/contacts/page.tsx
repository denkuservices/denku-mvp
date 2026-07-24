import Link from "next/link";
import { notFound } from "next/navigation";
import { platformUxEnabled } from "@/lib/platform/flags";
import PageHeader from "../_platform/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Contacts — placeholder (Sprint 5.5). The full Contacts surface (per-channel identities,
 * merge, history) generalizes Leads and lands in Sprint 5.5; the nav item exists now so the
 * platform IA is complete. Behind PLATFORM_UX_ENABLED, so not customer-visible yet.
 */
export default async function ContactsPage() {
  if (!platformUxEnabled()) notFound();

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Contacts"
        subtitle="The people your business talks to, unified across every channel."
      />
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center dark:border-white/10 dark:bg-navy-800">
        <p className="text-sm font-medium text-navy-700 dark:text-white">Contacts is arriving in the next release</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
          A unified, channel-agnostic view of every person your AI Employees have spoken with —
          generalizing today&apos;s leads with per-channel identities and full history.
        </p>
        <Link
          href="/dashboard/conversations"
          className="mt-4 inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-600"
        >
          View conversations
        </Link>
      </div>
    </div>
  );
}
