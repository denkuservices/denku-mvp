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

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ phoneNumberId: string }> }
) {
  const ok = requireBasicAuth(req);
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });

  const { phoneNumberId } = await ctx.params;

  if (!phoneNumberId) {
    return NextResponse.json({ ok: false, error: "Missing phoneNumberId param" }, { status: 400 });
  }

  try {
    const phoneNumber = await vapiFetch<VapiPhoneNumber>(`/phone-number/${phoneNumberId}`, {
      method: "GET",
    });

    return NextResponse.json({ ok: true, phoneNumber });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "Vapi phone number get failed", details: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
