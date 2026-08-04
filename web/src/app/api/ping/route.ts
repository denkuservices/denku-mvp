import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");

  return NextResponse.json({
    hasAuthorizationHeader: Boolean(auth),
    authorizationStartsWithBasic: auth?.startsWith("Basic ") ?? false,
    authorizationPreview: auth ? auth.slice(0, 30) + "..." : null,
    env: {
      ADMIN_USER: process.env.ADMIN_USER ?? null,
      ADMIN_PASS_SET: Boolean(process.env.ADMIN_PASS),
      NODE_ENV: process.env.NODE_ENV ?? null,
    },
  });
}
