import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { makeChain } from "./helpers/supabaseMock";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase/admin";
import { findPlanSubscriptionItem } from "@/lib/billing/subscription";

const from = supabaseAdmin.from as unknown as Mock;

/** The two add-on prices a real workspace's subscription can carry beside its plan. */
const ADDON_PRICES = [
  { stripe_price_id: "price_extra_phone" },
  { stripe_price_id: "price_extra_concurrency" },
];

function item(id: string, priceId: string) {
  return { id, price: { id: priceId, product: "prod_1" } };
}

function subscriptionWith(items: ReturnType<typeof item>[]) {
  return { items: { data: items } } as never;
}

beforeEach(() => {
  from.mockReset();
  from.mockReturnValue(makeChain({ data: ADDON_PRICES }));
});

describe("telling the plan apart from the add-ons on a subscription", () => {
  it("finds the plan among add-on items", async () => {
    // The plan is created from inline price_data at checkout and has no catalogue id, so it is
    // identified by elimination rather than by matching anything.
    const found = await findPlanSubscriptionItem(
      subscriptionWith([
        item("si_addon", "price_extra_concurrency"),
        item("si_plan", "price_inline_starter"),
      ])
    );
    expect(found?.id).toBe("si_plan");
  });

  it("does not assume the plan is the first item", async () => {
    // Item order is Stripe's business, and "first" happens to be true today.
    const found = await findPlanSubscriptionItem(
      subscriptionWith([
        item("si_phone", "price_extra_phone"),
        item("si_conc", "price_extra_concurrency"),
        item("si_plan", "price_inline_growth"),
      ])
    );
    expect(found?.id).toBe("si_plan");
  });

  it("refuses when two items could be the plan", async () => {
    // Charging the wrong line item is worse than refusing the change and saying so. The route
    // turns this null into a 409 rather than picking one.
    const found = await findPlanSubscriptionItem(
      subscriptionWith([
        item("si_a", "price_unknown_one"),
        item("si_b", "price_unknown_two"),
      ])
    );
    expect(found).toBeNull();
  });

  it("refuses when the subscription carries add-ons only", async () => {
    const found = await findPlanSubscriptionItem(
      subscriptionWith([item("si_phone", "price_extra_phone")])
    );
    expect(found).toBeNull();
  });

  it("survives an empty add-on catalogue without mislabelling everything as the plan", async () => {
    from.mockReturnValue(makeChain({ data: [] }));
    // With nothing to eliminate, a single item IS the plan — but two remain ambiguous rather than
    // becoming a coin flip.
    expect((await findPlanSubscriptionItem(subscriptionWith([item("si_x", "p1")])))?.id).toBe("si_x");
    expect(
      await findPlanSubscriptionItem(subscriptionWith([item("si_x", "p1"), item("si_y", "p2")]))
    ).toBeNull();
  });
});
