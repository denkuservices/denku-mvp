import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { getWorkspaceDefaultLanguage } from "@/lib/org/getWorkspaceDefaultLanguage";
import { platformUxEnabled } from "@/lib/platform/flags";
import PageHeader from "../../_platform/PageHeader";
import { Surface } from "../../_platform/ui";
import HireEmployeeForm from "./HireEmployeeForm";

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

  /*
   * Whether this employee will get a phone number, decided here so the form can SAY so before
   * the button is pressed rather than after. A chat-only plan includes zero numbers, and a voice
   * plan can be at its limit; in both cases the hire still succeeds and produces an employee that
   * answers on chat channels.
   */
  let willGetPhone = false;
  let phoneReason: string | null = "Your plan has no phone line available for it.";
  try {
    const orgId = await getActiveOrgId();
    if (orgId) {
      const { getEffectiveLimits } = await import("@/lib/billing/limits");
      const limits = await getEffectiveLimits(orgId);
      const { count } = await supabase
        .from("agents")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .not("vapi_phone_number_id", "is", null)
        .not("vapi_assistant_id", "is", null);

      const bound = count ?? 0;
      willGetPhone = bound < limits.included_phones;
      phoneReason = willGetPhone
        ? null
        : limits.included_phones === 0
          ? "Your plan does not include a phone line."
          : `You are using all ${limits.included_phones} of your plan's numbers.`;
    }
  } catch {
    // Never block hiring over a capacity read. The action makes the same decision again and is
    // the one that counts; this only decides what the page promises.
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
          <HireEmployeeForm
            defaultLanguage={defaultLanguage}
            willGetPhone={willGetPhone}
            phoneReason={phoneReason}
          />
        </Surface>

        <p className="mt-4 text-xs text-gray-500">
          Hiring provisions a phone number for this employee, so it counts against your plan&apos;s
          included numbers.
        </p>
      </div>
    </div>
  );
}
