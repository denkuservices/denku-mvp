import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Which AI employee a newly connected channel should answer with.
 *
 * Connecting a channel used to leave "Assign AI employee" empty, which is friction charged to
 * every customer to serve the few who have more than one employee. Almost nobody does: a
 * workspace gets exactly one employee at activation, so the dropdown was asking a question with
 * one possible answer — and an unassigned channel is not merely untidy, it is a channel whose
 * messages arrive and go unanswered.
 *
 * The rule: an explicit choice always wins. Otherwise take the workspace's main employee, and
 * failing that the oldest one. A customer who later creates a second employee and wants it on a
 * particular channel changes it from that channel's own dropdown — which is the right place for
 * a decision only they can make.
 *
 * Returns null only when the workspace genuinely has no employee. Never throws: failing to pick
 * a default must leave the connection unassigned, not refuse the connection.
 */
export async function defaultEmployeeIdForOrg(orgId: string): Promise<string | null> {
  if (!orgId) return null;

  try {
    const { data: settings } = await supabaseAdmin
      .from("organization_settings")
      .select("main_agent_id")
      .eq("org_id", orgId)
      .maybeSingle<{ main_agent_id: string | null }>();

    if (settings?.main_agent_id) {
      // Trust it only if the employee still exists — a stale pointer would assign a channel to
      // nothing, which looks assigned and answers nobody.
      const { data: main } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("org_id", orgId)
        .eq("id", settings.main_agent_id)
        .maybeSingle<{ id: string }>();
      if (main?.id) return main.id;
    }

    const { data: oldest } = await supabaseAdmin
      .from("agents")
      .select("id")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string }>();

    return oldest?.id ?? null;
  } catch (err) {
    console.error("[DEFAULT_EMPLOYEE][FAILED]", {
      org_id: orgId,
      error: err instanceof Error ? err.message : "unknown",
    });
    return null;
  }
}
