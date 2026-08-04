import { NextRequest, NextResponse } from "next/server";
import { requireBasicAuth } from "@/lib/auth/basic";
import { vapiFetch } from "@/lib/vapi/server";

type VapiPhoneNumber = {
  id: string;
  orgId?: string;
  assistantId?: string | null;
  number?: string;
  name?: string;
  provider?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  server?: {
    url?: string;
    timeoutSeconds?: number;
    headers?: Record<string, string>;
  };
};

export async function GET(req: NextRequest) {
  const ok = requireBasicAuth(req);
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? "50");
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50;

  try {
    // Vapi endpoint is singular in their API: /phone-number
    const phoneNumbers = await vapiFetch<VapiPhoneNumber[]>(
      `/phone-number?limit=${safeLimit}`,
      { method: "GET" }
    );

    return NextResponse.json({
      ok: true,
      count: phoneNumbers?.length ?? 0,
      phoneNumbers: phoneNumbers ?? [],
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Vapi phone number list failed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
