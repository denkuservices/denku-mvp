import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));

import { createInvite, consumeInviteForEmail, generateInviteToken } from "@/lib/members/invites";
import { getSupportEmail, getSupportMailto } from "@/lib/support";
import { makeFakeDb, type FakeDb } from "./helpers/fakePlatformDb";

describe("generateInviteToken", () => {
  it("produces distinct, non-trivial tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});

describe("createInvite / consumeInviteForEmail", () => {
  let db: FakeDb;
  beforeEach(() => {
    db = makeFakeDb();
    db.tables.org_invites = [];
  });

  it("creates a pending invite and returns a token", async () => {
    const res = await createInvite({ orgId: "o1", email: "Jane@Example.com", role: "admin", invitedBy: "u1" }, db as any);
    expect(res.ok).toBe(true);
    expect(res.token).toBeTruthy();
    // email is normalized lowercase
    expect(db.tables.org_invites[0].email).toBe("jane@example.com");
    expect(db.tables.org_invites[0].status).toBe("pending");
  });

  it("consumes a pending invite by email (case-insensitive), marks it accepted", async () => {
    await createInvite({ orgId: "o1", email: "jane@example.com", role: "admin", invitedBy: "u1" }, db as any);
    const consumed = await consumeInviteForEmail("JANE@example.com", db as any);
    expect(consumed).toEqual({ orgId: "o1", role: "admin" });
    expect(db.tables.org_invites[0].status).toBe("accepted");
  });

  it("returns null for an unknown email (normal new-org signup)", async () => {
    expect(await consumeInviteForEmail("nobody@example.com", db as any)).toBeNull();
  });

  it("does not consume an expired invite", async () => {
    db.tables.org_invites.push({
      id: "i1", org_id: "o1", email: "old@example.com", role: "admin",
      token: "t", status: "pending", expires_at: "2000-01-01T00:00:00Z",
    });
    expect(await consumeInviteForEmail("old@example.com", db as any)).toBeNull();
  });

  it("reports not_enabled when the org_invites table is absent (honest, no fake success)", async () => {
    const stub = {
      from: () => ({
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { code: "42P01", message: 'relation "org_invites" does not exist' } }),
          }),
        }),
      }),
    };
    const res = await createInvite({ orgId: "o1", email: "x@y.com", role: "admin", invitedBy: null }, stub as any);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not_enabled");
  });
});

describe("support contact (R-047)", () => {
  it("defaults to a brand address and honors the env override", () => {
    expect(getSupportEmail({})).toBe("support@denku.io");
    expect(getSupportEmail({ NEXT_PUBLIC_SUPPORT_EMAIL: "help@acme.com" })).toBe("help@acme.com");
  });
  it("builds a working mailto with an encoded subject", () => {
    const m = getSupportMailto("Denku support", {});
    expect(m).toContain("mailto:support@denku.io");
    expect(m).toContain("subject=Denku%20support");
  });
});
