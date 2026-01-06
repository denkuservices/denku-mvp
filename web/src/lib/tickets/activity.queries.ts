import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TicketActivity, ListTicketActivityParams } from "./activity.types";

/**
 * List all activity for a ticket (newest first)
 * Joins with profiles to get actor information
 */
export async function listTicketActivity(params: ListTicketActivityParams): Promise<TicketActivity[]> {
  const supabase = await createSupabaseServerClient();
  const { orgId, ticketId, limit = 50 } = params;

  // 1) Fetch activity
  const { data: activities, error: activitiesError } = await supabase
    .from("ticket_activity")
    .select("id, org_id, ticket_id, actor_profile_id, event_type, summary, diff, created_at")
    .eq("org_id", orgId)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (activitiesError) {
    throw new Error(`Failed to fetch activity: ${activitiesError.message}`);
  }

  if (!activities || activities.length === 0) {
    return [];
  }

  // 2) Gather unique actor profile IDs
  const actorIds = new Set<string>();
  for (const activity of activities) {
    if (activity.actor_profile_id) {
      actorIds.add(activity.actor_profile_id);
    }
  }

  // 3) Fetch profiles in one query
  let profilesMap: Map<string, { id: string; full_name: string | null; email: string | null }> = new Map();
  if (actorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(actorIds));

    if (profiles) {
      for (const profile of profiles) {
        profilesMap.set(profile.id, {
          id: profile.id,
          full_name: profile.full_name,
          email: profile.email,
        });
      }
    }
  }

  // 4) Build result with actor information
  return activities.map((activity) => {
    const actor = activity.actor_profile_id ? profilesMap.get(activity.actor_profile_id) ?? null : null;

    // Parse diff JSONB if it's a string
    let diff: Record<string, { before: unknown; after: unknown }> | null = null;
    if (activity.diff) {
      if (typeof activity.diff === "string") {
        try {
          diff = JSON.parse(activity.diff);
        } catch {
          diff = null;
        }
      } else {
        diff = activity.diff as Record<string, { before: unknown; after: unknown }>;
      }
    }

    return {
      id: activity.id,
      ticket_id: activity.ticket_id,
      actor_profile_id: activity.actor_profile_id,
      event_type: activity.event_type,
      summary: activity.summary,
      diff,
      created_at: activity.created_at,
      actor,
    };
  });
}

