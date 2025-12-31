import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// (Opsiyonel) Eğer Vercel/Next runtime ile ilgili issue yaşarsan bunu aç:
// export const runtime = "nodejs";

// Vapi'den gelen body farklı şekillerde gelebiliyor.
// Biz en azından message.type ve message.timestamp bekleyip geri kalanını serbest bırakıyoruz.
const VapiWebhookSchema = z.object({
  message: z
    .object({
      type: z.string(),
      timestamp: z.number().optional(),
    })
    .passthrough(),
}).passthrough();

function getHeader(req: NextRequest, name: string) {
  return req.headers.get(name) ?? req.headers.get(name.toLowerCase()) ?? "";
}

export async function POST(req: NextRequest) {
  try {
    // 1) Secret kontrol (Vapi UI'da gönderdiğin header ile aynı olmalı)
    // Vapi tarafında sen "x-vapi-secret" koymuşsun.
    const incomingSecret = getHeader(req, "x-vapi-secret");

    const expectedSecret = process.env.VAPI_WEBHOOK_SECRET || ""; // Vercel env'e koy: VAPI_WEBHOOK_SECRET
    if (expectedSecret && incomingSecret !== expectedSecret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    // 2) Body parse
    const raw = await req.json().catch(() => null);
    if (!raw) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    // 3) Zod validate
    const parsed = VapiWebhookSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "invalid_payload", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    // 4) Log (Vercel logs'ta görmelisin)
    console.log("VAPI WEBHOOK HIT ✅", {
      type: parsed.data.message.type,
      timestamp: parsed.data.message.timestamp,
    });

    // 5) Hızlı 200 dönüş (Vapi 404 yerine bunu görmeli)
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("VAPI WEBHOOK ERROR ❌", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}

// Debug için tarayıcıdan açınca 200 gör:
export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/webhooks/vapi" });
}
