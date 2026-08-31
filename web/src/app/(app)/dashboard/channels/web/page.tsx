import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { listConnections } from "@/lib/webchat/connections";
import { isTokenSigningConfigured } from "@/lib/webchat/token";
import { llmConfigured } from "@/lib/llm/provider";
import { getBaseUrl } from "@/lib/utils/url";
import PageHeader from "../../_platform/PageHeader";
import { WebChatCard, type EmployeeOption } from "./_components/WebChatCard";

export const dynamic = "force-dynamic";

/**
 * Web Chat channel surface: create the embed, say where it may run, choose who answers.
 *
 * Reached from Settings → Channels, never from the sidebar — connecting a channel is
 * configuration you do once, and a nav item per channel is what stops the sidebar surviving the
 * next three (see skills/platform-architecture.md).
 */
export default async function WebChatPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        title="Web Chat"
        subtitle="A chat bubble on your own website, answered by your AI Employee. Every conversation lands in your Inbox, where anyone on your team can take over."
      />

      {/* A chat channel with no model behind it would install, receive, and say nothing — which
          looks exactly like a broken widget. Say so before the snippet is pasted, not after. */}
      {!llmConfigured() ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          No AI model is configured on this environment yet, so the widget would receive messages
          without answering them. Contact support before installing it.
        </div>
      ) : null}

      {/* Sessions are signed; a deployment that cannot sign cannot open one, and every visitor
          would see the chat fail to start. Better to say it here than in a browser console. */}
      {!isTokenSigningConfigured() ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Web Chat is not configured on this deployment yet, so the widget cannot start a
          conversation. Contact support.
        </div>
      ) : null}

      {!canManage ? (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
          Only owners and admins can set up the chat widget.
        </div>
      ) : null}

      <WebChatCard
        connection={
          connection
            ? {
                id: connection.id,
                siteKey: connection.siteKey,
                siteName: connection.siteName,
                allowedOrigins: connection.allowedOrigins,
                displayName: connection.displayName,
                accentColor: connection.accentColor,
                greeting: connection.greeting,
                status: connection.status,
                lastError: connection.lastError,
                lastInboundAt: connection.lastInboundAt,
                assignedAgentId: connection.assignedAgentId,
              }
            : null
        }
        employees={employees}
        canManage={canManage}
        scriptOrigin={getBaseUrl().replace(/\/+$/, "")}
      />
    </div>
  );
}
