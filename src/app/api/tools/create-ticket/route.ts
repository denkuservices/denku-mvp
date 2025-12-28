import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ALLOWED_CATEGORIES = ["billing", "technical", "order", "account", "general", "other"];

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      caller_phone,
      caller_name,
      company,
      category,
      summary,
      priority, // "low" | "normal" | "high"
    } = body ?? {};

    if (!summary) {
      return NextResponse.json({ ok: false, error: "summary is required" }, { status: 400 });
    }

    const normalizedCategory = String(category || "other").toLowerCase();
    const safeCategory = ALLOWED_CATEGORIES.includes(normalizedCategory) ? normalizedCategory : "other";

    const normalizedPriority = String(priority || "normal").toLowerCase();
    const safePriority = ["low", "normal", "high"].includes(normalizedPriority) ? normalizedPriority : "normal";

    const { data, error } = await supabaseAdmin
      .from("tickets")
      .insert({
        caller_phone: caller_phone ?? null,
        caller_name: caller_name ?? null,
        company: company ?? null,
        category: safeCategory,
        summary,
        priority: safePriority,
        status: "open",
        source: "vapi",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ticket_id: data.id,
      message: "Ticket created.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
