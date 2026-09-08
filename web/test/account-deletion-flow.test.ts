import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The deletion actually running, end to end, against fakes.
 *
 * `account-deletion.test.ts` checks the list and the shape. This one executes `deleteAccount()` and
 * watches what it does in what order, because the two things that make this control safe are
 * ordering properties and neither is visible in a snapshot: **the subscription is cancelled before
 * anything is destroyed**, and **the sign-in account is destroyed last**. Get the first wrong and a
 * business that no longer exists keeps being charged; get the second wrong and a failure halfway
 * through leaves a workspace nobody can sign in to finish deleting.
 */

/* ------------------------------------------------------------------ fakes */

let ops: string[] = [];
let tableData: Record<string, unknown> = {};

function builder(table: string) {
  let op = "select";
  const chain: Record<string, unknown> = {};
  const passthrough = [
    "select", "insert", "upsert", "eq", "neq", "is", "not", "or", "in", "order", "limit", "range",
  ];
  for (const m of passthrough) chain[m] = () => chain;
  chain.delete = () => {
    op = "delete";
    return chain;
  };
  chain.update = () => {
    op = "update";
    return chain;
  };

  const result = () => (tableData[table] as object) ?? { data: [], error: null, count: 0 };
  const settle = () => {
    if (op !== "select") ops.push(`${op}:${table}`);
    return result();
  };

  chain.maybeSingle = () => Promise.resolve(settle());
  chain.single = () => Promise.resolve(settle());
  chain.then = (resolve: (v: unknown) => unknown) => resolve(settle());
  return chain;
}

const deleteUser = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: (table: string) => builder(table),
    rpc: vi.fn(async (name: string) => {
      ops.push(`rpc:${name}`);
      return { data: { orgs: 1 }, error: null };
    }),
    auth: {
      admin: {
        deleteUser: (...args: unknown[]) => {
          ops.push("auth:deleteUser");
          return deleteUser(...(args as []));
        },
      },
    },
    storage: {
      from: () => ({
        list: async () => ({ data: [], error: null }),
        remove: async () => ({ data: null, error: null }),
      }),
    },
  },
}));

const viewer = {
  userId: "11111111-1111-4111-8111-111111111111",
  profileId: "11111111-1111-4111-8111-111111111111",
  orgId: "22222222-2222-4222-8222-222222222222",
  role: "owner" as string | null,
  email: "owner@example.com",
};

vi.mock("@/lib/auth/permissions", () => ({
  getViewer: async () => viewer,
}));

let ownerCount = 1;
vi.mock("@/lib/members/roster", () => ({
  countOwners: async () => ownerCount,
}));

const vapiFetch = vi.fn(async (path: string) => {
  ops.push(`vapi:${path}`);
  return {};
});
vi.mock("@/lib/vapi/server", () => ({ vapiFetch: (...a: unknown[]) => vapiFetch(...(a as [string])) }));

vi.mock("@/lib/telegram/api", () => ({
  deleteWebhook: async () => {
    ops.push("telegram:deleteWebhook");
    return { ok: true };
  },
}));
vi.mock("@/lib/telegram/connections", () => ({ getBotToken: async () => "bot-token" }));

vi.mock("@/lib/observability/logEvent", () => ({ logEvent: () => {} }));

let cancelThrows = false;
const cancel = vi.fn(async (id: string) => {
  if (cancelThrows) throw new Error("card_declined");
  ops.push(`stripe:cancel:${id}`);
  return { id };
});

vi.mock("stripe", () => ({
  default: class FakeStripe {
    subscriptions = {
      list: async () => ({ data: [{ id: "sub_1", status: "active" }] }),
      cancel: (id: string) => cancel(id),
    };
  },
}));

import { deleteAccount } from "@/lib/account/deleteAccount";

/* ------------------------------------------------------------------ setup */

function seedWorkspace() {
  tableData = {
    billing_stripe_customers: { data: { stripe_customer_id: "cus_1" }, error: null },
    phone_lines: { data: [{ vapi_phone_number_id: "num_line" }], error: null },
    agents: {
      data: [{ vapi_assistant_id: "asst_agent", vapi_phone_number_id: null }],
      error: null,
    },
    // The pre-`agents` era put the assistant and the number on the org row itself.
    orgs: { data: { vapi_assistant_id: "asst_legacy", vapi_phone_number_id: "num_legacy" }, error: null },
    sip_trunks: { data: [{ vapi_credential_id: "cred_1" }], error: null },
    telegram_connections: { data: [{ id: "tg_1" }], error: null },
    profiles: { data: null, error: null, count: 0 },
  };
}

beforeEach(() => {
  ops = [];
  ownerCount = 1;
  cancelThrows = false;
  viewer.role = "owner";
  // Reset, not clear: one test replaces the implementation with a throwing one, and a leaked
  // override would make a later test pass for the wrong reason.
  vapiFetch.mockReset();
  vapiFetch.mockImplementation(async (path: string) => {
    ops.push(`vapi:${path}`);
    return {};
  });
  cancel.mockClear();
  deleteUser.mockClear();
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  process.env.VAPI_API_KEY = "vapi_test_x";
  seedWorkspace();
});

/* ------------------------------------------------------------------ tests */

describe("the sole owner deletes the workspace with their account", () => {
  it("cancels the subscription, releases what we rent, purges the rows, then removes the user", async () => {
    const result = await deleteAccount();

    expect(result).toMatchObject({ ok: true, scope: "workspace_and_account" });

    const at = (needle: string) => ops.findIndex((o) => o === needle);
    expect(at("stripe:cancel:sub_1")).toBeGreaterThanOrEqual(0);
    // Money first, then the destruction, then the identity.
    expect(at("stripe:cancel:sub_1")).toBeLessThan(at("rpc:purge_org_data"));
    expect(at("rpc:purge_org_data")).toBeLessThan(at("auth:deleteUser"));
    expect(at("auth:deleteUser")).toBe(ops.length - 1);
  });

  it("hands back every Vapi resource, including the ones on the legacy org row", async () => {
    await deleteAccount();

    const paths = vapiFetch.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/phone-number/num_line");
    expect(paths).toContain("/phone-number/num_legacy");
    expect(paths).toContain("/assistant/asst_agent");
    expect(paths).toContain("/assistant/asst_legacy");
    expect(paths).toContain("/credential/cred_1");

    // Numbers before assistants: a half-finished release should leave an assistant nobody can
    // reach, never a live number pointing at nothing.
    const lastNumber = Math.max(...paths.map((p, i) => (p.startsWith("/phone-number/") ? i : -1)));
    const firstAssistant = paths.findIndex((p) => p.startsWith("/assistant/"));
    expect(lastNumber).toBeLessThan(firstAssistant);
  });

  it("points the customer's Telegram bot away from us while we still hold the token", async () => {
    await deleteAccount();
    expect(ops).toContain("telegram:deleteWebhook");
  });

  it("still deletes when Vapi refuses — a stuck number is not a reason to trap someone", async () => {
    vapiFetch.mockImplementation(async () => {
      throw new Error("Vapi error 500: boom");
    });
    const result = await deleteAccount();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.warnings.length).toBeGreaterThan(0);
    expect(ops).toContain("rpc:purge_org_data");
  });
});

describe("a subscription that will not cancel stops everything", () => {
  it("destroys nothing and says so", async () => {
    cancelThrows = true;

    const result = await deleteAccount();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/nothing was deleted/i);
    // The three things that must not have happened.
    expect(ops).not.toContain("rpc:purge_org_data");
    expect(ops).not.toContain("auth:deleteUser");
    expect(vapiFetch).not.toHaveBeenCalled();
  });

  it("refuses rather than guessing when Stripe is not configured but a customer exists", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const result = await deleteAccount();
    expect(result.ok).toBe(false);
    expect(ops).not.toContain("rpc:purge_org_data");
  });

  it("proceeds when the workspace never bought anything", async () => {
    tableData.billing_stripe_customers = { data: null, error: null };
    const result = await deleteAccount();
    expect(result.ok).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
    expect(ops).toContain("rpc:purge_org_data");
  });
});

describe("anyone who is not the last owner takes only themselves", () => {
  it("leaves the workspace alone when a co-owner remains", async () => {
    ownerCount = 2;

    const result = await deleteAccount();

    expect(result).toMatchObject({ ok: true, scope: "account_only" });
    expect(ops).not.toContain("rpc:purge_org_data");
    expect(cancel).not.toHaveBeenCalled();
    expect(vapiFetch).not.toHaveBeenCalled();
    // Detached from the workspace, then removed as a person.
    expect(ops).toContain("update:profiles");
    expect(ops).toContain("delete:profiles");
    expect(ops).toContain("auth:deleteUser");
  });

  it("leaves the workspace alone for an admin", async () => {
    viewer.role = "admin";
    const result = await deleteAccount();
    expect(result).toMatchObject({ ok: true, scope: "account_only" });
    expect(ops).not.toContain("rpc:purge_org_data");
  });

  it("treats an unrecognised role as no role and keeps the workspace", async () => {
    // Fail closed: a typo in `profiles.role` must never read as "owner".
    viewer.role = null;
    const result = await deleteAccount();
    expect(result).toMatchObject({ ok: true, scope: "account_only" });
    expect(ops).not.toContain("rpc:purge_org_data");
  });
});
