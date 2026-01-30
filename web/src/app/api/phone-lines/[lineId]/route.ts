import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { vapiFetch } from "@/lib/vapi/server";
import { getEffectiveLimits } from "@/lib/billing/limits";
import { logEvent } from "@/lib/observability/logEvent";

/**
 * DELETE /api/phone-lines/[lineId]
 * 
 * Real delete endpoint with compensation-safe flow:
 * 1. Auth + resolve org_id
 * 2. Load phone line row (requires assigned_agent_id column)
 * 3. Stripe: decrement extra_phone qty (only if count > included_phone_numbers)
 * 4. Vapi: release phone number (best-effort)
 * 5. Backing agent cleanup: delete Vapi assistant + agent record (best-effort)
 * 6. DB: delete phone_lines row
 * 7. Rollback on failure
 * 
 * SQL Schema Requirements:
 * - phone_lines.assigned_agent_id (UUID, nullable) - references agents.id
 * - phone_lines.vapi_phone_number_id (TEXT, nullable) - Vapi phone number ID
 * - phone_lines.phone_number_e164 (TEXT, nullable) - E164 formatted phone number
 * - phone_lines.status (TEXT, nullable) - line status (live/paused)
 * - phone_lines.org_id (UUID, NOT NULL) - organization ID
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  const { lineId } = await params;
  let stripeDecremented = false;
  let vapiWarning: string | null = null;

  try {
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
    const org_id = profile?.org_id ?? null;

    if (!org_id) {
      return NextResponse.json(
        { ok: false, error: "Organization not found" },
        { status: 400 }
      );
    }

    // 3) Load phone line row
    const { data: phoneLine, error: lineError } = await supabaseAdmin
      .from("phone_lines")
      .select("id, vapi_phone_number_id, phone_number_e164, assigned_agent_id, status, org_id")
      .eq("id", lineId)
      .eq("org_id", org_id)
      .maybeSingle<{
        id: string;
        vapi_phone_number_id: string | null;
        phone_number_e164: string | null;
        assigned_agent_id: string | null;
        status: string | null;
        org_id: string;
      }>();

    if (lineError || !phoneLine) {
      return NextResponse.json(
        { ok: false, error: "Phone line not found" },
        { status: 404 }
      );
    }

    // 4) Determine if we should decrement Stripe addon
    // Rule: Only decrement if total phone_lines count > included_phone_numbers
    const { data: allLines } = await supabaseAdmin
      .from("phone_lines")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org_id);

    const totalLinesCount = allLines?.length ?? 0;

    // Get included_phone_numbers from plan catalog
    const effectiveLimits = await getEffectiveLimits(org_id);
    const includedPhoneNumbers = effectiveLimits.included_phones;

    const shouldDecrementStripe = totalLinesCount > includedPhoneNumbers;

    // 5) Stripe step: decrement extra_phone qty if needed
    if (shouldDecrementStripe) {
      // Get current addon qty
      const { data: currentAddon } = await supabaseAdmin
        .from("billing_org_addons")
        .select("qty")
        .eq("org_id", org_id)
        .eq("addon_key", "extra_phone")
        .maybeSingle<{ qty: number }>();

      const currentQty = currentAddon?.qty ? Number(currentAddon.qty) : 0;
      const newQty = Math.max(0, currentQty - 1); // Ensure non-negative

      const addonUpdateUrl = new URL("/api/billing/addons/update", req.url);
      const addonUpdateRes = await fetch(addonUpdateUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: req.headers.get("Cookie") || "",
        },
        body: JSON.stringify({
          addon_key: "extra_phone",
          qty: newQty,
        }),
      });

      if (!addonUpdateRes.ok) {
        const addonData = await addonUpdateRes.json().catch(() => ({}));
        return NextResponse.json(
          { ok: false, error: addonData.error || "Failed to update billing" },
          { status: addonUpdateRes.status }
        );
      }

      stripeDecremented = true;
    }

    // 6) Vapi step: release phone number (best-effort)
    if (phoneLine.vapi_phone_number_id) {
      try {
        await vapiFetch(`/phone-number/${phoneLine.vapi_phone_number_id}`, {
          method: "DELETE",
        });
      } catch (vapiErr) {
        // Log but continue - best-effort only
        vapiWarning = "Vapi phone number release failed";
        console.warn("[PhoneLineDelete] Vapi release failed:", vapiErr);
      }
    }

    // 7) Backing agent cleanup (best-effort)
    if (phoneLine.assigned_agent_id) {
      try {
        // Get agent to find vapi_assistant_id
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("vapi_assistant_id")
          .eq("id", phoneLine.assigned_agent_id)
          .eq("org_id", org_id)
          .maybeSingle<{ vapi_assistant_id: string | null }>();

        // Delete Vapi assistant if exists
        if (agent?.vapi_assistant_id) {
          try {
            await vapiFetch(`/assistant/${agent.vapi_assistant_id}`, {
              method: "DELETE",
            });
          } catch (assistantErr) {
            // Log but continue
            console.warn("[PhoneLineDelete] Vapi assistant delete failed:", assistantErr);
          }
        }

        // Delete agent record (best-effort)
        const { error: agentDeleteError } = await supabaseAdmin
          .from("agents")
          .delete()
          .eq("id", phoneLine.assigned_agent_id)
          .eq("org_id", org_id);

        if (agentDeleteError) {
          console.warn("[PhoneLineDelete] Agent record delete failed:", agentDeleteError);
        }
      } catch (agentErr) {
        // Log but continue
        console.warn("[PhoneLineDelete] Backing agent cleanup failed:", agentErr);
      }
    }

    // 8) DB step: delete phone line row
    const { error: deleteError } = await supabaseAdmin
      .from("phone_lines")
      .delete()
      .eq("id", lineId)
      .eq("org_id", org_id);

    if (deleteError) {
      // Rollback Stripe if DB delete fails
      if (stripeDecremented && shouldDecrementStripe) {
        try {
          const { data: currentAddon } = await supabaseAdmin
            .from("billing_org_addons")
            .select("qty")
            .eq("org_id", org_id)
            .eq("addon_key", "extra_phone")
            .maybeSingle<{ qty: number }>();

          const currentQty = currentAddon?.qty ? Number(currentAddon.qty) : 0;
          const rollbackQty = currentQty + 1;

          const addonUpdateUrl = new URL("/api/billing/addons/update", req.url);
          await fetch(addonUpdateUrl.toString(), {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: req.headers.get("Cookie") || "",
            },
            body: JSON.stringify({
              addon_key: "extra_phone",
              qty: rollbackQty,
            }),
          });
        } catch (rollbackErr) {
          // Log but don't fail response
          console.error("[PhoneLineDelete] Stripe rollback failed:", rollbackErr);
        }
      }

      return NextResponse.json(
        { ok: false, error: "Failed to delete phone line" },
        { status: 500 }
      );
    }

    // 9) Success
    logEvent({
      tag: "[PHONE_LINES][DELETE][SUCCESS]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      org_id: org_id,
      severity: "info",
      details: {
        line_id: lineId,
        vapi_phone_number_id: phoneLine.vapi_phone_number_id,
        assigned_agent_id: phoneLine.assigned_agent_id,
        stripe_decremented: stripeDecremented,
        vapi_warning: vapiWarning,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        ...(vapiWarning ? { warning: vapiWarning } : {}),
      },
      { status: 200 }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    
    logEvent({
      tag: "[PHONE_LINES][DELETE][ERROR]",
      ts: Date.now(),
      stage: "COST",
      source: "system",
      severity: "error",
      details: {
        line_id: lineId,
        error: errorMsg,
        stripe_decremented: stripeDecremented,
      },
    });

    return NextResponse.json(
      { ok: false, error: "Failed to delete phone line" },
      { status: 500 }
    );
  }
}
