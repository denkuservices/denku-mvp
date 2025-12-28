import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/admin/:path*"],
};

export function middleware(req: NextRequest) {
  const pass = process.env.ADMIN_PASSWORD;

  // If not configured, block by default
  if (!pass) {
    return NextResponse.json({ ok: false, error: "Admin not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  const expected = "Basic " + Buffer.from(`admin:${pass}`).toString("base64");

  if (auth !== expected) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Denku Admin"' },
    });
  }

  return NextResponse.next();
}
