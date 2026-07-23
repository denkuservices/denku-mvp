import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getActiveOrgId } from "@/lib/org/getActiveOrgId";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Dashboard-wide paused banner (R-009) — makes a paused AI line loudly visible
 * in-app, pairing with the pause email. Renders nothing when the workspace is
 * active. Server component; best-effort (never throws into the layout).
 */
export default async function PausedBanner() {
  let orgId: string | null = null;
  try {
    orgId = await getActiveOrgId();
  } catch {
    return null;
  }
  if (!orgId) return null;

  let status: string | null = null;
  let reason: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("organization_settings")
      .select("workspace_status, paused_reason")
      .eq("org_id", orgId)
      .maybeSingle<{ workspace_status: string | null; paused_reason: string | null }>();
    status = data?.workspace_status ?? null;
    reason = data?.paused_reason ?? null;
  } catch {
    return null;
  }

  if (status !== "paused") return null;

  const message =
    reason === "hard_cap"
      ? "Your AI line is paused — you reached your monthly usage cap. Inbound calls aren't being answered."
      : reason === "past_due"
      ? "Your AI line is paused — a payment is needed. Inbound calls aren't being answered."
      : "Your AI line is paused. Inbound calls aren't being answered.";

  return (
    <div
      role="alert"
      className="mx-2.5 mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-red-500/30 dark:bg-red-500/10"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <p className="text-sm font-medium text-red-800 dark:text-red-200">{message}</p>
      </div>
      <Link
        href="/dashboard/settings/workspace/billing"
        className="shrink-0 rounded-lg bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-red-700"
      >
        Manage billing
      </Link>
    </div>
  );
}
