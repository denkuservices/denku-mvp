import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * POST /api/phone-lines/[lineId]/resume
 * 
 * Resumes a phone line by:
 * 1. Setting status='live' in phone_lines table
 * 2. Restoring assistant binding in Vapi from vapi_assistant_id_paused_backup
 * 
 * DB Schema Note:
 * This route requires the phone_lines table to have a column:
 *   vapi_assistant_id_paused_backup text null
 * 
 * SQL to add if missing:
 *   ALTER TABLE public.phone_lines
 *   ADD COLUMN IF NOT EXISTS vapi_assistant_id_paused_backup text null;
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await params;

    // 1) Authenticate user
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2) Get org_id from profile
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, org_id")
      .eq("auth_user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    const profile = profiles && profiles.length > 0 ? profiles[0] : null;
    const orgId = profile?.org_id ?? null;

    if (!orgId) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 400 }
      );
    }

    // 3) Fetch the phone line by id and org_id
    const { data: phoneLine, error: fetchError } = await supabaseAdmin
      .from("phone_lines")
      .select("id, vapi_phone_number_id, status, vapi_assistant_id_paused_backup")
      .eq("id", lineId)
      .eq("org_id", orgId)
      .maybeSingle<{
        id: string;
        vapi_phone_number_id: string | null;
        status: string | null;
        vapi_assistant_id_paused_backup: string | null;
      }>();

    if (fetchError || !phoneLine) {
      return NextResponse.json(
        { ok: false, error: "Phone line not found" },
        { status: 404 }
      );
    }

    if (!phoneLine.vapi_phone_number_id) {
      // No phone number bound - just update DB status
      const { error: updateError } = await supabaseAdmin
        .from("phone_lines")
        .update({
          status: "live",
          updated_at: new Date().toISOString(),
        })
        .eq("id", lineId)
        .eq("org_id", orgId);

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: "Failed to resume phone line" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        status: "live",
      });
    }

    // 4) Restore assistantId from backup
    const assistantIdToRestore = phoneLine.vapi_assistant_id_paused_backup;

    if (assistantIdToRestore) {
      try {
        // Restore assistant binding in Vapi
        await vapiFetch(`/phone-number/${phoneLine.vapi_phone_number_id}`, {
          method: "PATCH",
          body: JSON.stringify({ assistantId: assistantIdToRestore }),
        });

        logEvent({
          tag: "[PHONE_LINE][RESUME][VAPI_REBIND_SUCCESS]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "info",
          details: {
            line_id: lineId,
            vapi_phone_number_id: phoneLine.vapi_phone_number_id,
            old_assistant_id: null,
            new_assistant_id: assistantIdToRestore,
            action: "resume",
          },
        });
      } catch (vapiErr) {
        const errorMsg = vapiErr instanceof Error ? vapiErr.message : String(vapiErr);
        logEvent({
          tag: "[PHONE_LINE][RESUME][VAPI_REBIND_FAILED]",
          ts: Date.now(),
          stage: "CALL",
          source: "system",
          org_id: orgId,
          severity: "error",
          details: {
            line_id: lineId,
            vapi_phone_number_id: phoneLine.vapi_phone_number_id,
            attempted_assistant_id: assistantIdToRestore,
            error: errorMsg,
            action: "resume",
          },
        });
        // Continue with DB update even if Vapi fails - user can retry
      }
    } else {
      // No backup assistantId - log warning
      logEvent({
        tag: "[PHONE_LINE][RESUME][NO_BACKUP]",
        ts: Date.now(),
        stage: "CALL",
        source: "system",
        org_id: orgId,
        severity: "warn",
        details: {
          line_id: lineId,
          vapi_phone_number_id: phoneLine.vapi_phone_number_id,
          message: "Resuming line but no backup assistantId found - phone number may not route calls",
        },
      });
    }

    // 5) Update DB status to 'live' (keep backup for future pauses)
    const { error: updateError } = await supabaseAdmin
      .from("phone_lines")
      .update({
        status: "live",
        updated_at: new Date().toISOString(),
        // Keep vapi_assistant_id_paused_backup for future pauses
      })
      .eq("id", lineId)
      .eq("org_id", orgId);

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: "Failed to resume phone line" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: "live",
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
