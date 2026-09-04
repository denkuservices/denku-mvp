import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCachedUser } from "@/lib/auth/currentUser";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConnections } from "@/lib/telegram/connections";
import { llmConfigured } from "@/lib/llm/provider";
import PageHeader from "../../_platform/PageHeader";
import EmployeeAssignmentNotice from "../../_platform/channels/EmployeeAssignmentNotice";
import { TelegramConnectionCard, type EmployeeOption } from "./_components/TelegramConnectionCard";

export const dynamic = "force-dynamic";

/**
 * Telegram channel surface: connect a bot, choose who answers on it.
 *
 * Reached from Settings → Channels, never from the sidebar — connecting a channel is
 * configuration you do once, and a nav item per channel is what stops the sidebar from
 * surviving WhatsApp and Email (see skills/platform-architecture.md).
 *
 * The page shows only non-secret metadata. The stored token is never read here.
 */
export default async function TelegramPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getCachedUser();

  let orgId: string | null = null;
  let canManage = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id, role")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ org_id: string | null; role: string | null }>();

    orgId = profile?.org_id ?? null;
    canManage = profile?.role === "owner" || profile?.role === "admin";
  }

  const connections = orgId ? await listConnections(orgId) : [];
  const connection = connections[0] ?? null;

  let employees: EmployeeOption[] = [];
  if (orgId) {
    const { data } = await supabaseAdmin
      .from("agents")
      .select("id, name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    employees = (data ?? []).map((a) => ({ id: a.id as string, name: (a.name as string) || "Assistant" }));
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/dashboard/channels"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 transition hover:text-brand-500"
      >
        <ArrowLeft className="h-4 w-4" /> Channels
      </Link>
      <PageHeader
        title="Telegram"
        subtitle="Your AI Employee answers Telegram messages on a bot you own. Customers message the bot; the AI books appointments and passes anything else to your team."
      />

      {/* An AI channel with no model behind it would connect, receive, and say nothing — which
          looks exactly like a broken bot. Say so before the token is pasted, not after. */}
      {!llmConfigured() ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          No AI model is configured on this environment yet, so a connected bot would receive
          messages without answering them. Contact support before connecting.
        </div>
      ) : null}

      {!canManage ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
          Only owners and admins can connect a Telegram bot.
        </div>
      ) : null}

      <EmployeeAssignmentNotice
        employeeCount={employees.length}
        assignedAgentId={connection?.assignedAgentId ?? null}
        channelLabel="Telegram"
        connected={Boolean(connection)}
      />

      <TelegramConnectionCard
        connection={
          connection
            ? {
                id: connection.id,
                botUsername: connection.botUsername,
                botName: connection.botName,
                status: connection.status,
                lastError: connection.lastError,
                lastInboundAt: connection.lastInboundAt,
                assignedAgentId: connection.assignedAgentId,
              }
            : null
        }
        employees={employees}
        canManage={canManage}
      />
    </div>
  );
}
