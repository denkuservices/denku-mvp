import { NextRequest } from 'next/server';

export function requireBasicAuth(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64')
    .toString('utf8')
    .split(':');

  const [username, password] = credentials;

  return (
    username === process.env.ADMIN_USER &&
    password === process.env.ADMIN_PASS
  );
}
