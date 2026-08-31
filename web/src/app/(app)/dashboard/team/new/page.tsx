import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getWorkspaceDefaultLanguage } from "@/lib/org/getWorkspaceDefaultLanguage";
import { platformUxEnabled } from "@/lib/platform/flags";
import { LANGUAGES, LANGUAGE_CODES } from "@/lib/language/registry";
import { createAgentAction } from "../../agents/new/actions";
import PageHeader from "../../_platform/PageHeader";
import { Surface, CONTROL_CLASS } from "../../_platform/ui";
import TimezoneField from "../../_platform/TimezoneField";

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

  /*
   * The workspace's default language, finally used for something (2026-08-28).
   *
   * Settings → Workspace → Identity promises in its own helper text that this is the "starting
   * point for new employees". This is the one place that promise can be kept, so this is where it
   * is read. The helper never throws — hiring must not fail over a default.
   */
  let defaultLanguage = "en";
  try {
    defaultLanguage = await getWorkspaceDefaultLanguage(await getActiveOrgId());
  } catch {
    // Not signed into an org yet; English is the product default.
  }

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
                  Primary language
                </label>
                {/*
                  Options come from the language registry, so this picker cannot offer what the
                  voice stack cannot speak. It used to list **Turkish** — removed from the other
                  two pickers by R-135 for having no voice or transcriber behind it, and left
                  standing here, the fourth list nobody knew to update.
                */}
                <select
                  id="language"
                  name="language"
                  defaultValue={defaultLanguage}
                  className={`${CONTROL_CLASS} w-full`}
                >
                  {LANGUAGE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGES[code].label}
                    </option>
                  ))}
                </select>
                {/*
                  Deliberately says something different about each channel, because the truth is
                  different. In chat the system prompt instructs the AI to answer in whatever
                  language the customer wrote in, with nothing to configure. On a call it is bound
                  by the language registry — an ear that transcribes it and a mouth that speaks
                  it — which is why the picker is short. Writing one reassuring sentence covering
                  both would be false for voice, and false in the direction that loses a caller.
                */}
                <p className="mt-1 text-xs text-gray-500">
                  What it speaks on calls, and its default everywhere. <strong>In chat it replies
                  in whichever language the customer writes in</strong> — Turkish, German, anything —
                  no setup needed. Calls are limited to the languages listed here; add more under
                  Setup once it is hired.
                </p>
              </div>
            </div>

            {/*
              Was a free-text box defaulting to "UTC". Almost nobody edited it, so employees were
              created believing they worked in UTC — and this is the value the AI uses to decide
              what "tomorrow" means when it books. A business in İstanbul books three hours off
              and nothing looks broken while it happens.
            */}
            <TimezoneField />

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
