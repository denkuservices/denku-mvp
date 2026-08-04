import { NextRequest } from "next/server";

function parseBasic(header: string) {
  const [scheme, value] = header.split(" ");
  if (scheme !== "Basic" || !value) return null;

  let decoded = "";
  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
  } catch {
    return null;
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return null;

  const username = decoded.slice(0, idx).trim();
  const password = decoded.slice(idx + 1).trim();
  return { username, password };
}

export function requireBasicAuth(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  const creds = parseBasic(authHeader);
  if (!creds) return false;

  const expectedUser = (process.env.ADMIN_USER ?? "admin").trim();
  const expectedPass = (process.env.ADMIN_PASS ?? "adminpass").trim();

  return creds.username === expectedUser && creds.password === expectedPass;
}
