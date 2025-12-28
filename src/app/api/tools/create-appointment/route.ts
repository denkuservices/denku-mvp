import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/rateLimit";

function normalizePhone(input: unknown) {
  if (input === null || input === undefined) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // If it already has digits, keep only digits
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 7) return digitsOnly;

  // Convert "one two three" style to digits
  const s = raw.toLowerCase();

  const map: Record<string, string> = {
    zero: "0",
    oh: "0",
    one: "1",
    two: "2",
    to: "2",
    too: "2",
    three: "3",
    four: "4",
    for: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8",
    ate: "8",
    nine: "9",
  };

  const tokens = s.split(/[\s\-_.]+/g).filter(Boolean);
  const converted = tokens.map((t) => map[t]).filter(Boolean).join("");

  return converted.length >= 7 ? converted : raw; // fallback to raw if cannot parse
}

export async function POST(req: Request) {
    const secret = req.headers.get("x-denku-secret");
    const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const rl = rateLimit(`tool:create-appointment:${ip}`, 30, 60_000);
if (!rl.ok) {
  return NextResponse.json(
    { ok: false, error: "Rate limit exceeded" },
    { status: 429 }
  );
}

if (secret !== process.env.VAPI_TOOL_SECRET) {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

  try {
    // Robust JSON parsing (Vapi / proxies sometimes send weird bodies)
    const raw = await req.text();
    let body: any;

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON", raw }, { status: 400 });
    }

    const { caller_phone, caller_name, company, datetime, notes } = body ?? {};

    if (!datetime) {
      return NextResponse.json({ ok: false, error: "datetime is required" }, { status: 400 });
    }

    // Minimal datetime sanity check (optional but helpful)
    const dt = String(datetime).trim();
    if (!dt) {
      return NextResponse.json({ ok: false, error: "datetime is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        caller_phone: normalizePhone(caller_phone),
        caller_name: caller_name ? String(caller_name) : null,
        company: company ? String(company) : null,
        datetime: dt,
        notes: notes ? String(notes) : null,
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
