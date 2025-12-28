import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const raw = await req.text();
let body: any;
try {
  body = JSON.parse(raw);
} catch {
  return NextResponse.json({ ok: false, error: "Invalid JSON", raw }, { status: 400 });
}


    // Vapi tool payload esnek gelir; biz minimal normalize ediyoruz
    const {
      caller_phone,
      caller_name,
      company,
      datetime, // ISO string bekliyoruz
      notes,
    } = body ?? {};

    if (!datetime) {
      return NextResponse.json({ ok: false, error: "datetime is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        caller_phone: caller_phone ?? null,
        caller_name: caller_name ?? null,
        company: company ?? null,
        datetime,
        notes: notes ?? null,
        source: "vapi",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      appointment_id: data.id,
      message: "Appointment created.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
