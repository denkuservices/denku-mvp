import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { updateAgentPromptOverride } from "@/app/(app)/dashboard/settings/_actions/agents";

/**
 * PATCH /api/phone-lines/[lineId]/update-agent-config
 *
 * Updates the assigned agent's system_prompt_override for this phone line.
 * Reuses the existing updateAgentPromptOverride action (org check, role, Vapi sync).
 */

const BodySchema = z.object({
  system_prompt_override: z.string().nullable(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ lineId: string }> }
) {
  try {
    const { lineId } = await params;

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

    const { data: phoneLine, error: lineError } = await supabaseAdmin
      .from("phone_lines")
      .select("id, assigned_agent_id")
      .eq("id", lineId)
      .eq("org_id", orgId)
      .maybeSingle<{ id: string; assigned_agent_id: string | null }>();

    if (lineError || !phoneLine) {
      return NextResponse.json(
        { ok: false, error: "Phone line not found" },
        { status: 404 }
      );
    }

    if (!phoneLine.assigned_agent_id) {
      return NextResponse.json(
        { ok: false, error: "No agent assigned to this line" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const result = await updateAgentPromptOverride({
      agentId: phoneLine.assigned_agent_id,
      system_prompt_override: parsed.data.system_prompt_override,
    });

    if (!result.ok) {
      const status = result.error.includes("Unauthorized")
        ? 401
        : result.error.includes("Forbidden")
          ? 403
          : result.error.includes("not found")
            ? 404
            : 400;
      return NextResponse.json({ ok: false, error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      data: result.data,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
