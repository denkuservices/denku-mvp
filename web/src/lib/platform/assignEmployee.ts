import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { channelMeta, type Channel } from "@/lib/platform/channels";
import { CONNECTION_SOURCES } from "@/lib/platform/readModel/channels";

/**
 * Bind one channel connection to one AI Employee — the write side of Employee↔Channel ownership.
 *
 * **Why this exists at all.** Every surface in the product already READS ownership generically:
 * `readModel/channels.ts` declares an `ownerColumn` per channel and derives from it the "no
 * employee assigned" health state, the Channels card's "Assign an employee" button, and the
 * employee's own Channels tab. Nothing wrote it. Activation provisioned a number, created an
 * assistant in Vapi, created the `agents` row — and then inserted the `phone_lines` row with
 * `assigned_agent_id: null`. So a customer finished paying and landed on a dashboard telling them
 * their voice channel had no employee, next to a button that led to a page with no way to assign
 * one. The plumbing was right and the last inch was missing.
 *
 * **Registry-driven, like the reads.** The channel names its own table and owner column, so this
 * works for voice, telegram, email and web today and for the next channel with no edit here — the
 * same rule `skills/platform-architecture.md` sets for adding a channel.
 *
 * **Two writes, one meaning.** The connection row is the source of truth every read model uses.
 * `employee_channels` is the Sprint 4.5 platform table, still awaiting its backfill (R-081), and
 * is written best-effort so the two do not drift further apart. A failure there is logged and
 * swallowed: it must never cost the customer the assignment that actually makes their AI answer.
 */

export type AssignResult =
  | { ok: true; employeeId: string | null }
  | { ok: false; error: string };

/** Whether a channel can be owned by an employee at all — i.e. the registry names its column. */
export function channelIsAssignable(channel: Channel): boolean {
  return Boolean(CONNECTION_SOURCES[channel]?.ownerColumn);
}

/**
 * Assign (or, with `employeeId: null`, unassign) an employee on one connection.
 *
 * Org-scoped on both sides: the connection must belong to this org, and so must the employee.
 * With the service-role client there is no RLS net, and an unscoped update here would let a
 * guessed connection id point someone else's phone line at our employee.
 */
export async function assignEmployeeToChannel({
  orgId,
  channel,
  connectionId,
  employeeId,
  db = supabaseAdmin,
}: {
  orgId: string;
  channel: Channel;
  connectionId: string;
  employeeId: string | null;
  db?: SupabaseClient;
}): Promise<AssignResult> {
  if (!orgId || !connectionId) return { ok: false, error: "Missing workspace or connection." };

  const source = CONNECTION_SOURCES[channel];
  if (!source?.ownerColumn) {
    return { ok: false, error: `${channelMeta(channel).label} connections can't be assigned to an employee.` };
  }

  // An employee id that is not this org's is refused rather than written — the update below is
  // org-scoped, so it would otherwise store a dangling reference the read models cannot resolve.
  if (employeeId) {
    const { data: agent, error: agentError } = await db
      .from("agents")
      .select("id")
      .eq("id", employeeId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string }>();

    if (agentError) {
      console.error("[PLATFORM][ASSIGN][AGENT_LOOKUP_FAILED]", agentError.message);
      return { ok: false, error: "Could not check that AI employee. Please try again." };
    }
    if (!agent) return { ok: false, error: "That AI employee is not in this workspace." };
  }

  const { data: updated, error } = await db
    .from(source.table)
    .update({ [source.ownerColumn]: employeeId, updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("org_id", orgId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("[PLATFORM][ASSIGN][FAILED]", { channel, error: error.message });
    return { ok: false, error: "Could not save the assignment. Please try again." };
  }
  if (!updated) return { ok: false, error: "That connection no longer exists." };

  await syncEmployeeChannelRow({ orgId, channel, connectionId, employeeId, db });

  console.info("[PLATFORM][ASSIGN][OK]", {
    org_id: orgId,
    channel,
    connection_id: connectionId,
    employee_id: employeeId,
  });

  return { ok: true, employeeId };
}

/**
 * Mirror the assignment into `employee_channels`.
 *
 * Never throws and never reports failure upward. The table is additive platform-model state that
 * nothing customer-facing reads yet, and it may not even exist on an environment where the
 * Sprint 4.5 migrations have not been applied — which is exactly the situation where a strict
 * write would turn "your AI now answers this number" into an error message.
 */
async function syncEmployeeChannelRow({
  orgId,
  channel,
  connectionId,
  employeeId,
  db,
}: {
  orgId: string;
  channel: Channel;
  connectionId: string;
  employeeId: string | null;
  db: SupabaseClient;
}): Promise<void> {
  try {
    // Ownership is exclusive: one connection is answered by one employee, so any previous owner's
    // row is cleared before the new one is written.
    await db
      .from("employee_channels")
      .delete()
      .eq("org_id", orgId)
      .eq("channel", channel)
      .eq("connection_ref", connectionId);

    if (!employeeId) return;

    await db.from("employee_channels").insert({
      org_id: orgId,
      employee_id: employeeId,
      channel,
      connection_ref: connectionId,
      status: "active",
    });
  } catch (err) {
    console.warn(
      "[PLATFORM][ASSIGN][EMPLOYEE_CHANNELS_SYNC_SKIPPED]",
      err instanceof Error ? err.message : String(err)
    );
  }
}
