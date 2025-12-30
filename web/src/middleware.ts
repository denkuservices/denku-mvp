import { NextRequest, NextResponse } from "next/server";

function isAuthorizedBasic(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const base64 = authHeader.split(" ")[1] ?? "";
  const decoded = Buffer.from(base64, "base64").toString("utf8");
  const [user, pass] = decoded.split(":");

  return user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS;
}

// MVP amaçlı session check: Supabase auth cookie var mı?
function hasSupabaseSessionCookie(request: NextRequest) {
  // Supabase cookie isimleri projeye göre değişebilir; genelde sb- ile başlar
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Admin koruması (Basic Auth) — aynen devam
  const isAdminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (isAdminArea) {
    if (isAuthorizedBasic(request)) return NextResponse.next();

    return new NextResponse("Unauthorized", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Admin Area"',
      },
    });
  }

  // 2) App koruması (Supabase session) — /dashboard
  const isDashboard = pathname.startsWith("/dashboard");
  if (isDashboard) {
    if (hasSupabaseSessionCookie(request)) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

