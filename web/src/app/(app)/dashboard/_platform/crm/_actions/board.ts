"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/permissions";
import { updateTicket } from "@/lib/tickets/actions";

/**
 * Move a request between board columns.
 *
 * A thin wrapper on purpose: `updateTicket` already owns the org check, the actor resolution and
 * the activity log, and a board that wrote `tickets.status` itself would be a second path to the
 * same column with none of that. Dragging a card is the same act as changing the status on the
 * detail page, and it should leave the same trail.
 */
export async function moveRequestToStatus(
  ticketId: string,
  status: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer.orgId || !viewer.userId) return { ok: false, error: "Please sign in again." };

  const result = await updateTicket(viewer.orgId, viewer.userId, {
    orgId: viewer.orgId,
    ticketId,
    patch: { status },
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard/crm/requests");
  return { ok: true };
}
