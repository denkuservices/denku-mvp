import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Signup must never mail anything to an account that already exists.
 *
 * The bug this locks down: `signInWithOtp({ shouldCreateUser: true })` sends whichever email
 * template Supabase picks for the address, and for a KNOWN address that template is "Magic Link".
 * So an existing customer who typed their own address into the signup form was emailed a
 * one-click sign-in link and landed in their dashboard with no explanation. The whole guarantee
 * now rests on one thing — the check running BEFORE the send, and the send not happening — so
 * that is what these assert, not the wording of any message.
 */

type ProfileRow = { email: string | null };

let profileRows: ProfileRow[] = [];
let profileError: { message: string } | null = null;
/** Every address `signInWithOtp` was asked to mail. Must stay empty for a registered address. */
let sent: string[] = [];
let otpError: { message: string; status?: number } | null = null;

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: () => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "ilike", "eq"]) {
        builder[method] = () => builder;
      }
      builder.limit = () =>
        Promise.resolve({ data: profileError ? null : profileRows, error: profileError });
      return builder;
    },
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      signInWithOtp: async ({ email }: { email: string }) => {
        sent.push(email);
        return { data: {}, error: otpError };
      },
    },
  }),
}));

vi.mock("@/lib/utils/url", () => ({ getBaseUrl: () => "https://denku.io" }));

import { sendCodeAction } from "@/app/(auth)/signup/sendCodeAction";
import { emailAlreadyRegistered } from "@/lib/auth/emailAlreadyRegistered";

function form(email: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  return fd;
}

beforeEach(() => {
  profileRows = [];
  profileError = null;
  otpError = null;
  sent = [];
});

describe("emailAlreadyRegistered", () => {
  it("recognises a finished account", async () => {
    profileRows = [{ email: "owner@shop.com" }];
    expect(await emailAlreadyRegistered("owner@shop.com")).toBe("registered");
  });

  it("ignores case and surrounding whitespace", async () => {
    profileRows = [{ email: "Owner@Shop.com " }];
    expect(await emailAlreadyRegistered("  owner@shop.com")).toBe("registered");
  });

  it("does not treat a LIKE wildcard match as the same address", async () => {
    // `_` is a single-character wildcard in LIKE and legal in an email, so the narrowing query
    // can return a different person. Matching on the pattern alone would refuse a genuinely new
    // customer their signup code.
    profileRows = [{ email: "axb@shop.com" }];
    expect(await emailAlreadyRegistered("a_b@shop.com")).toBe("new");
  });

  it("reports an unknown address as new", async () => {
    profileRows = [];
    expect(await emailAlreadyRegistered("nobody@shop.com")).toBe("new");
  });

  it("reports `unknown` rather than guessing when the lookup fails", async () => {
    profileError = { message: "connection reset" };
    expect(await emailAlreadyRegistered("owner@shop.com")).toBe("unknown");
  });
});

describe("sendCodeAction", () => {
  it("sends NOTHING when the address already has an account", async () => {
    profileRows = [{ email: "owner@shop.com" }];

    const result = await sendCodeAction(form("owner@shop.com"));

    expect(sent).toEqual([]);
    expect(result).toEqual({ ok: false, code: "ALREADY_REGISTERED" });
  });

  it("refuses without an `error` string, so the page can word it in the reader's language", async () => {
    profileRows = [{ email: "owner@shop.com" }];
    const result = await sendCodeAction(form("owner@shop.com"));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("error");
  });

  it("still sends to a new address", async () => {
    const result = await sendCodeAction(form("new@shop.com"));

    expect(sent).toEqual(["new@shop.com"]);
    expect(result).toEqual({ ok: true });
  });

  it("still sends to a signup somebody abandoned before it finished", async () => {
    // An auth user with no profile row asked for a code and never came back. They are mid-signup,
    // not signed up — refusing them would strand them with an account they cannot reach and no
    // password to sign in with.
    profileRows = [{ email: "someone.else@shop.com" }];

    await sendCodeAction(form("halfway@shop.com"));

    expect(sent).toEqual(["halfway@shop.com"]);
  });

  it("sends when the lookup itself failed, rather than blocking every signup on a blip", async () => {
    profileError = { message: "connection reset" };

    await sendCodeAction(form("new@shop.com"));

    expect(sent).toEqual(["new@shop.com"]);
  });

  it("reports a send failure as an error, distinct from the refusal", async () => {
    otpError = { message: "rate limit exceeded", status: 429 };

    const result = await sendCodeAction(form("new@shop.com"));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("ERROR");
  });
});
