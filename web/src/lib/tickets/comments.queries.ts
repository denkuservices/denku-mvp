import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TicketComment, ListTicketCommentsParams } from "./comments.types";

/**
 * List all comments for a ticket (newest first)
 * Joins with profiles to get author information
 */
export async function listTicketComments(params: ListTicketCommentsParams): Promise<TicketComment[]> {
  const supabase = await createSupabaseServerClient();
  const { orgId, ticketId } = params;

  // 1) Fetch comments (ordered by created_at desc - newest first)
  const { data: comments, error: commentsError } = await supabase
    .from("ticket_comments")
    .select("id, org_id, ticket_id, author_profile_id, body, created_at")
    .eq("org_id", orgId)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });

  if (commentsError) {
    throw new Error(`Failed to fetch comments: ${commentsError.message}`);
  }

  if (!comments || comments.length === 0) {
    return [];
  }

  // 2) Gather unique author profile IDs
  const authorIds = new Set<string>();
  for (const comment of comments) {
    if (comment.author_profile_id) {
      authorIds.add(comment.author_profile_id);
    }
  }

  // 3) Fetch profiles in one query
  let profilesMap: Map<string, { id: string; full_name: string | null; email: string | null }> = new Map();
  if (authorIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", Array.from(authorIds));

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

  // 4) Build result with author information
  return comments.map((comment) => {
    const author = comment.author_profile_id ? profilesMap.get(comment.author_profile_id) ?? null : null;

    return {
      id: comment.id,
      ticket_id: comment.ticket_id,
      author_profile_id: comment.author_profile_id,
      body: comment.body,
      created_at: comment.created_at,
      author,
    };
  });
}

