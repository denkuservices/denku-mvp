import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A confirmation link that lands where nothing reads it.
 *
 * Found on production: a customer signed up, received a link, clicked it, and arrived at
 * `https://www.denku.io/?code=…` — the marketing homepage, signed out, with no error and no
 * explanation. The code was valid the whole time; it simply arrived at a page with no idea what
 * to do with it.
 *
 * Two causes, and both are guarded here because either alone is enough to strand someone:
 *
 *  1. The OTP senders did not name a redirect, so Supabase fell back to the project's Site URL.
 *  2. Nothing rescued a code that arrived at the wrong path — and links already in people's
 *     inboxes still point at the old one.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("every sender names the callback", () => {
  // Whether the email carries six digits or a link is the TEMPLATE's decision, not the code's —
  // and Supabase silently picks a different template for an address that already exists. So a
  // sender that assumes "we only ever send codes" is one template change away from stranding
  // people, which is exactly what happened.
  const senders = [
    "src/app/(auth)/signup/sendCodeAction.ts",
    "src/app/(auth)/verify-email/_actions/verify.ts",
    "src/app/(auth)/verify-email/_actions/resendSignupEmail.ts",
  ];

  it.each(senders)("%s sets emailRedirectTo", (file) => {
    const source = read(file);
    expect(source).toMatch(/signInWithOtp/);
    expect(source).toMatch(/emailRedirectTo/);
  });

  it.each(senders)("%s points it at /auth/callback", (file) => {
    expect(read(file)).toMatch(/auth\/callback/);
  });
});

describe("a stray code is forwarded rather than dropped", () => {
  const middleware = read("src/middleware.ts");

  it("forwards any request carrying ?code= to the callback", () => {
    expect(middleware).toMatch(/searchParams\.get\("code"\)/);
    expect(middleware).toMatch(/pathname = "\/auth\/callback"/);
  });

  it("does not forward the callback to itself", () => {
    // Without this the redirect loops, and a working link becomes a browser error page.
    expect(middleware).toMatch(/pathname !== "\/auth\/callback"/);
  });

  it("runs before the locale redirect, so a code is never rewritten into a locale path", () => {
    const codeIndex = middleware.indexOf('searchParams.get("code")');
    const localeIndex = middleware.indexOf("stripLocaleFromUnlocalised(request.nextUrl.pathname)");
    expect(codeIndex).toBeGreaterThan(-1);
    expect(localeIndex).toBeGreaterThan(-1);
    expect(codeIndex).toBeLessThan(localeIndex);
  });

  it("still covers the site root, which is where the stray codes actually landed", () => {
    expect(middleware).toMatch(/matcher: \[[\s\S]*"\/",/);
  });
});

describe("the callback can consume what it is sent", () => {
  const callback = read("src/app/auth/callback/route.ts");

  it("exchanges a PKCE code for a session", () => {
    expect(callback).toMatch(/exchangeCodeForSession\(code\)/);
  });

  it("still handles the legacy token_hash form", () => {
    expect(callback).toMatch(/token_hash/);
  });
});
