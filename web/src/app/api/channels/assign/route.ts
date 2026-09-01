import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { CHANNEL_ORDER, type Channel } from "@/lib/platform/channels";
import { assignEmployeeToChannel, channelIsAssignable } from "@/lib/platform/assignEmployee";
import { getWorkspaceStatus } from "@/lib/workspace-status";

/**
 * POST /api/channels/assign — put an AI employee in charge of one channel connection.
 *
 * **One route for every channel, on purpose.** Ownership is already read generically from the
 * channel registry's `ownerColumn`, which is why voice, telegram, email and web all render an
 * "Assign an employee" affordance. A per-channel write route would have meant four copies of the
 * same three lines and a fifth to forget when the next channel lands.
 *
 * `employeeId: null` unassigns — which is a real thing to want (an owner taking a channel out of
 * service without deleting the connection), and is not the same as deleting the line.
 */

const AssignSchema = z.object({
  channel: z.enum(CHANNEL_ORDER as unknown as [Channel, ...Channel[]]),
  connectionId: z.string().uuid(),
  /** Null means "nobody answers this channel" — deliberate, not a missing value. */
  employeeId: z.string().uuid().nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    const orgId = profiles?.[0]?.org_id ?? null;
    if (!orgId) {
      return NextResponse.json({ ok: false, error: "Organization not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const parsed = AssignSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
    }

    const { channel, connectionId, employeeId } = parsed.data;

    if (!channelIsAssignable(channel)) {
      return NextResponse.json(
        { ok: false, error: "This channel can't be assigned to an employee." },
        { status: 400 }
      );
    }

    /*
     * A paused workspace may not change who answers.
     *
     * Pause means inbound is deliberately stopped, and the existing rule is that it overrides
     * everything (`skills/billing-and-stripe.md`). Letting an assignment through would be a
     * change to live routing made while routing is supposed to be frozen.
     */
    const workspaceStatus = await getWorkspaceStatus(orgId).catch(() => "active" as const);
    if (workspaceStatus === "paused") {
      return NextResponse.json(
        { ok: false, error: "Your workspace is paused. Resume it to change who answers." },
        { status: 409 }
      );
    }

    const result = await assignEmployeeToChannel({
      orgId,
      channel,
      connectionId,
      employeeId,
      db: supabaseAdmin,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, employeeId: result.employeeId });
  } catch (err) {
    console.error("[API][CHANNELS][ASSIGN][THREW]", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
