import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { platformUxEnabled } from "@/lib/platform/flags";
import { createAgentAction } from "../../agents/new/actions";
import PageHeader from "../../_platform/PageHeader";
import { Surface, CONTROL_CLASS } from "../../_platform/ui";

export const dynamic = "force-dynamic";

/**
 * Hire an AI employee (Sprint 11 · decision D7).
 *
 * Employees used to appear only as a side effect — of finishing onboarding, or of buying a phone
 * number, which quietly inserts a backing agent row. The one form that created one on purpose sat
 * at `/dashboard/agents/new`, called itself "Create an agent", and nothing in the platform IA
 * linked to it. The product's central noun could not be created from its own surface.
 *
 * **Hire-first UI over the existing channel-first plumbing:** this collects who the employee is
 * and hands off to `createAgentAction`, which is unchanged — it still provisions the Vapi
 * assistant and number, enforces the plan's phone limit and refuses on a paused workspace.
 */
export default async function HireEmployeePage() {
  if (!platformUxEnabled()) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/dashboard/team"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> AI Team
      </Link>

      <PageHeader
        title="Hire an AI employee"
        subtitle="It answers your customers on the channels you connect it to. You can change everything here later under Setup."
      />

      <div className="max-w-2xl">
        <Surface>
          <form action={createAgentAction} className="space-y-5">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. Front Desk"
                className={`${CONTROL_CLASS} w-full`}
              />
              <p className="mt-1 text-xs text-gray-500">
                How you&apos;ll recognise this employee in Denku.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="language" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                  Language
                </label>
                <select id="language" name="language" defaultValue="en" className={`${CONTROL_CLASS} w-full`}>
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="tr">Turkish</option>
                </select>
              </div>

              <div>
                <label htmlFor="voice" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                  Voice
                </label>
                <select id="voice" name="voice" defaultValue="alloy" className={`${CONTROL_CLASS} w-full`}>
                  <option value="alloy">Alloy</option>
                  <option value="verse">Verse</option>
                  <option value="aria">Aria</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="timezone" className="mb-1.5 block text-sm font-medium text-navy-700 dark:text-white">
                Timezone
              </label>
              <input
                id="timezone"
                name="timezone"
                required
                defaultValue="UTC"
                className={`${CONTROL_CLASS} w-full`}
              />
              <p className="mt-1 text-xs text-gray-500">
                Used when it talks about your opening hours.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
              <button
                type="submit"
                className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
              >
                Hire
              </button>
              <Link href="/dashboard/team" className="text-sm font-medium text-gray-500 transition hover:text-gray-800 dark:hover:text-gray-200">
                Cancel
              </Link>
            </div>
          </form>
        </Surface>

        <p className="mt-4 text-xs text-gray-500">
          Hiring provisions a phone number for this employee, so it counts against your plan&apos;s
          included numbers.
        </p>
      </div>
    </div>
  );
}
