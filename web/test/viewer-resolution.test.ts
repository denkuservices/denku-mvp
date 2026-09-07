import { describe, it, expect, vi, beforeEach } from "vitest";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

type Row = {
  id: string;
  auth_user_id: string | null;
  org_id: string | null;
  role: string | null;
  email: string | null;
};

let rows: Row[] = [];
let currentUser: { id: string; email: string | null } | null = null;
const issued: Array<{ select: string; or?: string }> = [];

vi.mock("@/lib/auth/currentUser", () => ({
  getCachedUser: async () => currentUser,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from() {
      const state: { select: string; or?: string } = { select: "" };
      issued.push(state);
      const chain: Record<string, unknown> = {};
      chain.select = (cols: string) => {
        state.select = cols;
        return chain;
      };
      chain.or = (filter: string) => {
        state.or = filter;
        return chain;
      };
      chain.eq = () => chain;
      chain.limit = () => chain;
      chain.order = () => chain;
      chain.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
      return chain;
    },
  },
}));

const freshViewer = async () => {
  vi.resetModules();
  const mod = await import("@/lib/auth/permissions");
  return mod.getViewer();
};

const row = (r: Partial<Row>): Row => ({
  id: "x",
  auth_user_id: null,
  org_id: null,
  role: null,
  email: null,
  ...r,
});

beforeEach(() => {
  rows = [];
  currentUser = { id: USER, email: "owner@shop.test" };
  issued.length = 0;
});

/**
 * `getViewer` is the resolver every capability check runs through, so a change to how it finds a
 * person is a change to who can spend a workspace's money.
 *
 * It used to probe `profiles` twice in series — `id`, then `auth_user_id` — which for accounts
 * written by signup (keyed on `auth_user_id`) meant a guaranteed wasted round-trip on every page.
 * The probes are now one query, and these tests exist because that is exactly the kind of rewrite
 * that quietly changes a preference rule.
 */
describe("getViewer — who the request is, and in which workspace", () => {
  it("asks once, for both identities", async () => {
    rows = [row({ id: "p1", auth_user_id: USER, org_id: "org-1", role: "owner" })];
    await freshViewer();

    const profileQueries = issued.filter((q) => q.select.includes("org_id"));
    expect(profileQueries).toHaveLength(1);
    expect(profileQueries[0].or).toBe(`id.eq.${USER},auth_user_id.eq.${USER}`);
  });

  it("prefers the row keyed by profiles.id", async () => {
    rows = [
      row({ id: USER, org_id: "org-by-id", role: "admin", email: "by-id@shop.test" }),
      row({ id: "p2", auth_user_id: USER, org_id: "org-by-auth", role: "owner" }),
    ];
    const viewer = await freshViewer();
    expect(viewer.orgId).toBe("org-by-id");
    expect(viewer.role).toBe("admin");
    expect(viewer.profileId).toBe(USER);
  });

  it("falls back to auth_user_id when no id-keyed row carries an org", async () => {
    rows = [row({ id: "p1", auth_user_id: USER, org_id: "org-1", role: "owner" })];
    const viewer = await freshViewer();
    expect(viewer.orgId).toBe("org-1");
    expect(viewer.role).toBe("owner");
  });

  it("stops at the NEWEST id-row rather than hunting for an older one that has an org", async () => {
    /*
     * The original was `.eq("id", …).order(updated_at desc).limit(1)` followed by a truthiness
     * check: a newer id-row without an org ended that attempt, and the resolver moved on to
     * auth_user_id. Searching past it to an older id-row would silently move somebody's workspace.
     * Rows arrive newest-first.
     */
    rows = [
      row({ id: USER, org_id: null, role: "viewer" }),
      row({ id: USER, org_id: "older-id-org", role: "owner" }),
      row({ id: "p3", auth_user_id: USER, org_id: "auth-org", role: "admin" }),
    ];
    const viewer = await freshViewer();
    expect(viewer.orgId).toBe("auth-org");
    expect(viewer.role).toBe("admin");
  });

  it("does not treat an unrecognised role string as a role", async () => {
    // Fail closed: a typo must not read as "owner" merely because it is not "viewer".
    rows = [row({ id: "p1", auth_user_id: USER, org_id: "org-1", role: "superuser" })];
    const viewer = await freshViewer();
    expect(viewer.orgId).toBe("org-1");
    expect(viewer.role).toBeNull();
  });

  it("returns no role for a user with no matching row", async () => {
    rows = [row({ id: OTHER, auth_user_id: OTHER, org_id: "someone-elses-org", role: "owner" })];
    const viewer = await freshViewer();
    expect(viewer.orgId).toBeNull();
    expect(viewer.role).toBeNull();
    expect(viewer.userId).toBe(USER);
  });

  it("returns nothing at all when nobody is signed in", async () => {
    currentUser = null;
    const viewer = await freshViewer();
    expect(viewer).toEqual({ userId: null, profileId: null, orgId: null, role: null, email: null });
    expect(issued).toHaveLength(0);
  });

  it("refuses to put a non-UUID id into the filter, and grants nothing", async () => {
    // The id is interpolated into PostgREST's grammar on the SERVICE-ROLE client. Anything that is
    // not a plain UUID is never sent, and no role is returned.
    currentUser = { id: "not-a-uuid,role.eq.owner", email: "x@y.z" };
    rows = [row({ id: "p1", auth_user_id: "not-a-uuid,role.eq.owner", org_id: "org-1", role: "owner" })];

    const viewer = await freshViewer();
    expect(viewer.orgId).toBeNull();
    expect(viewer.role).toBeNull();
    expect(issued).toHaveLength(0);
  });
});
