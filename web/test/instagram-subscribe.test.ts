import { describe, it, expect, vi } from "vitest";

// subscribedFieldsForScopes is pure, but its module imports connections.ts → the
// fail-fast service-role client. Mock it so the import chain loads under vitest.
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: {} }));

import { subscribedFieldsForScopes } from "@/lib/instagram/subscribe";

describe("subscribedFieldsForScopes (scope → webhook field mapping)", () => {
  it("maps messages scope to the messages field", () => {
    expect(subscribedFieldsForScopes(["instagram_business_basic", "instagram_business_manage_messages"]))
      .toEqual(["messages"]);
  });

  it("maps comments scope to the comments field", () => {
    expect(subscribedFieldsForScopes(["instagram_business_manage_comments"])).toEqual(["comments"]);
  });

  it("includes both when both scopes are granted", () => {
    expect(
      subscribedFieldsForScopes([
        "instagram_business_basic",
        "instagram_business_manage_messages",
        "instagram_business_manage_comments",
      ])
    ).toEqual(["messages", "comments"]);
  });

  it("returns [] when no subscribable scopes are present (won't call Meta)", () => {
    expect(subscribedFieldsForScopes(["instagram_business_basic"])).toEqual([]);
    expect(subscribedFieldsForScopes([])).toEqual([]);
    expect(subscribedFieldsForScopes(null)).toEqual([]);
  });
});
