import { NextResponse } from "next/server";
import { resend } from "@/lib/email/resend";

const DEFAULT_FROM = "Denku <hello@denku.io>";

const TEST_HTML = `
<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; padding: 16px;">
  <p>This is a dev-only test email from Denku.</p>
  <p>If you received this, Resend is configured correctly.</p>
</body>
</html>
`.trim();

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "Missing or invalid email in body" }, { status: 400 });
  }

  const from = process.env.RESEND_FROM ?? DEFAULT_FROM;

  if (!resend) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: "Denku Welcome Test",
      html: TEST_HTML,
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
