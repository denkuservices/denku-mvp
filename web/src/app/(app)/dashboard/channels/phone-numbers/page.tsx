import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPhoneLinesWithTodayCounts } from "@/lib/phone-lines/queries";
import { isPreviewMode } from "@/lib/billing/isPreviewMode";
import PhoneLinesClient from "./PhoneLinesClient";
import { AddPhoneNumberButton } from "./_components/AddPhoneNumberButton";

export const metadata = {
  title: "Phone Lines",
};

export const dynamic = "force-dynamic";

export default async function PhoneLinesPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Get org_id from profile
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("auth_user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1);

  const profile = profiles && profiles.length > 0 ? profiles[0] : null;
  const orgId = profile?.org_id ?? null;

  if (!orgId) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          No organization found. Please contact support.
        </div>
      </div>
    );
  }

  // Fetch phone lines with today inbound call counts (single RPC, no N+1)
  const phoneLines = await getPhoneLinesWithTodayCounts(orgId);

  // Check if user is in preview mode (no active plan)
  // Source of truth: org_plan_limits.plan_code (NULL = preview mode)
  let previewMode = false;
  try {
    previewMode = await isPreviewMode(orgId);
  } catch (err) {
    // Fallback to false (paid state) if check fails
    console.warn("[PhoneLinesPage] Error checking plan status, defaulting to paid state:", err);
    previewMode = false;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-navy-700 dark:text-white">
              Phone Lines
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Manage your phone numbers and how calls are handled
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <AddPhoneNumberButton isPreviewMode={previewMode} />
            {!previewMode && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Additional phone numbers are $10/month each. Taxes calculated at checkout.
              </p>
            )}
          </div>
        </div>
      </div>

      <PhoneLinesClient phoneLines={phoneLines} isPreviewMode={previewMode} />
    </div>
  );
}
