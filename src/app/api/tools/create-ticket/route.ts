import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { rateLimit } from "@/lib/rateLimit";


const ALLOWED_CATEGORIES = ["billing", "technical", "order", "account", "general", "other"];
function normalizePhone(input: unknown) {
  if (input === null || input === undefined) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // 1) If it already contains digits, strip non-digits
  const digitsOnly = raw.replace(/[^0-9]/g, "");
  if (digitsOnly.length >= 7) return digitsOnly;

  // 2) Convert "one two three" style to digits
  const s = raw.toLowerCase();

  const map: Record<string, string> = {
    zero: "0", oh: "0",
    one: "1",
    two: "2", to: "2", too: "2",
    three: "3",
    four: "4", for: "4",
    five: "5",
    six: "6",
    seven: "7",
    eight: "8", ate: "8",
    nine: "9",
  };

  const tokens = s.split(/[\s\-_.]+/g).filter(Boolean);
  const converted = tokens.map(t => map[t]).filter(Boolean).join("");

  return converted.length >= 7 ? converted : raw; // fallback to raw if cannot parse
}


export async function POST(req: Request) {

    const secret = req.headers.get("x-denku-secret");
        const ip =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "unknown";

const rl = rateLimit(`tool:create-ticket:${ip}`, 30, 60_000); // 30 req / 60s / IP
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
        caller_phone: normalizePhone(caller_phone),
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
