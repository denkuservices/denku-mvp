import { NextRequest, NextResponse } from "next/server";
import { vapiFetch } from "@/lib/vapi/server";

// Lists phone numbers from Vapi (debug/admin tooling)
export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 200)) : 50;

  try {
    const data = await vapiFetch<any>(`/phone-number?limit=${safeLimit}`, { method: "GET" });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Vapi list phone-numbers failed", details: String(e?.message ?? e) },
      { status: 400 }
    );
  }
}
