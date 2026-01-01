import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BodySchema = z.object({
  ids: z.array(z.string()).nonempty(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload" },
        { status: 400 }
      );
    }

    const ids = parsed.data.ids.slice(0, 50);

    const { data: agents, error } = await supabaseAdmin
      .from("agents")
      .select("id, name")
      .in("id", ids);

    if (error) {
      console.error("Failed to fetch agents by IDs:", error.message);
      return NextResponse.json(
        { ok: false, error: "internal_server_error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, agents: agents ?? [] });
  } catch (e) {
    console.error("Error processing /api/admin/agents/by-ids:", e);
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }
}

