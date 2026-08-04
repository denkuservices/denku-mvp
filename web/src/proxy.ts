import { NextRequest, NextResponse } from "next/server";

// MVP amaçlı session check: Supabase auth cookie var mı?
function hasSupabaseSessionCookie(request: NextRequest) {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1) Admin UI koruması (SADECE /admin)
  const isAdminUI = pathname.startsWith("/admin");
  if (isAdminUI) {
    const ok = hasSupabaseSessionCookie(request);
    if (ok) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // 2) App koruması — /dashboard
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
  matcher: ["/admin/:path*", "/dashboard/:path*"], // /api/admin ÇIKARILDI
};
