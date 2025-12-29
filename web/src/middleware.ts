import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) return false;

  const base64 = authHeader.split(' ')[1] ?? '';
  const decoded = Buffer.from(base64, 'base64').toString('utf8');
  const [user, pass] = decoded.split(':');

  return user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASS;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect both admin UI and admin APIs
  const shouldProtect =
    pathname.startsWith('/admin') || pathname.startsWith('/api/admin');

  if (!shouldProtect) return NextResponse.next();

  if (isAuthorized(request)) return NextResponse.next();

  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin Area"',
    },
  });
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
