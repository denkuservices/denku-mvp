import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * PATCH /api/phone-lines/[lineId]/update
 * 
 * Update phone line configuration fields (v1).
 * 
 * DB Schema Note:
 * This route requires the phone_lines table to have these columns:
 *   - display_name text null
 *   - language_mode text null (values: 'auto' | 'en' | 'tr')
 *   - tools_create_ticket boolean null
 *   - tools_book_appointment boolean null
 *   - first_message text null
 * 
 * SQL to add if missing:
 *   ALTER TABLE public.phone_lines
 *   ADD COLUMN IF NOT EXISTS display_name text null,
 *   ADD COLUMN IF NOT EXISTS language_mode text null,
 *   ADD COLUMN IF NOT EXISTS tools_create_ticket boolean null,
 *   ADD COLUMN IF NOT EXISTS tools_book_appointment boolean null,
 *   ADD COLUMN IF NOT EXISTS first_message text null;
 */

const UpdatePhoneLineSchema = z.object({
  display_name: z.string().optional().nullable(),
  language_mode: z.enum(["auto", "en", "tr"]).optional().nullable(),
  tools_create_ticket: z.boolean().optional().nullable(),
  tools_book_appointment: z.boolean().optional().nullable(),
  first_message: z.string().optional().nullable(),
});

export async function PATCH(
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

    // 3) Verify phone line exists and belongs to org
    const { data: existingLine, error: fetchError } = await supabaseAdmin
      .from("phone_lines")
      .select("id")
      .eq("id", lineId)
      .eq("org_id", orgId)
      .maybeSingle();

    if (fetchError || !existingLine) {
      return NextResponse.json(
        { ok: false, error: "Phone line not found" },
        { status: 404 }
      );
    }

    // 4) Parse and validate request body
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const parsed = UpdatePhoneLineSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // 5) Build update object (only include provided fields)
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.display_name !== undefined) {
      updateData.display_name = parsed.data.display_name;
    }
    if (parsed.data.language_mode !== undefined) {
      updateData.language_mode = parsed.data.language_mode;
    }
    if (parsed.data.tools_create_ticket !== undefined) {
      updateData.tools_create_ticket = parsed.data.tools_create_ticket;
    }
    if (parsed.data.tools_book_appointment !== undefined) {
      updateData.tools_book_appointment = parsed.data.tools_book_appointment;
    }
    if (parsed.data.first_message !== undefined) {
      updateData.first_message = parsed.data.first_message;
    }

    // 6) Update phone line
    const { data: updatedLine, error: updateError } = await supabaseAdmin
      .from("phone_lines")
      .update(updateData)
      .eq("id", lineId)
      .eq("org_id", orgId)
      .select()
      .single();

    if (updateError) {
      // Check if error is due to missing columns
      const errorMsg = updateError.message || String(updateError);
      if (errorMsg.includes("column") && errorMsg.includes("does not exist")) {
        return NextResponse.json(
          { ok: false, error: "Database schema update required. Please contact support." },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { ok: false, error: "Failed to update phone line" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: updatedLine,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: errorMsg },
      { status: 500 }
    );
  }
}
