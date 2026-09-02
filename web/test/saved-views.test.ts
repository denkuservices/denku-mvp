import { describe, it, expect, vi } from "vitest";

// The module reaches for the service-role client at load. These tests only exercise the pure
// normalisation rules, which is the part worth pinning: they decide whether two identical filters
// are one view or two.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: vi.fn() } }));
import {
  isSavedViewSurface,
  normalizeViewName,
  normalizeViewQuery,
  SAVED_VIEW_NAME_MAX,
} from "@/lib/platform/savedViews";

describe("what a saved view stores", () => {
  it("keeps the page's own params, so there is one definition of a filter", () => {
    expect(normalizeViewQuery("status=open&q=boiler")).toBe("q=boiler&status=open");
  });

  it("sorts keys so the same filter saved twice is the same view", () => {
    // Two people reach an identical list by clicking in different orders. Storing the raw string
    // would make those two different views with identical results.
    expect(normalizeViewQuery("q=x&status=open")).toBe(normalizeViewQuery("status=open&q=x"));
  });

  it("drops the view id, or a view would re-select itself forever", () => {
    expect(normalizeViewQuery("status=open&view=abc-123")).toBe("status=open");
  });

  it("drops paging, because a view is a filter and not a scroll position", () => {
    expect(normalizeViewQuery("status=open&page=3&cursor=zz&offset=60")).toBe("status=open");
  });

  it("drops empty values, which are the absence of a filter", () => {
    expect(normalizeViewQuery("status=&q=boiler")).toBe("q=boiler");
  });

  it("tolerates a leading question mark", () => {
    expect(normalizeViewQuery("?status=open")).toBe("status=open");
  });

  it("returns nothing for a query that filters nothing", () => {
    // The caller refuses to save this: a view of everything is the list itself.
    expect(normalizeViewQuery("")).toBe("");
    expect(normalizeViewQuery("view=abc")).toBe("");
  });
});

describe("naming a view", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeViewName("  Open   this week  ")).toBe("Open this week");
  });

  it("refuses a name that is only whitespace — an unnamed view cannot be picked", () => {
    expect(normalizeViewName("   ")).toBeNull();
    expect(normalizeViewName("")).toBeNull();
  });

  it("caps the length rather than rejecting a long name", () => {
    const name = normalizeViewName("x".repeat(SAVED_VIEW_NAME_MAX + 40));
    expect(name).not.toBeNull();
    expect(name!.length).toBe(SAVED_VIEW_NAME_MAX);
  });
});

describe("which lists can hold views", () => {
  it("accepts the surfaces the table's CHECK constraint allows", () => {
    for (const surface of ["requests", "contacts", "appointments", "calls"]) {
      expect(isSavedViewSurface(surface)).toBe(true);
    }
  });

  it("refuses anything else, so a typo fails here and not at the database", () => {
    expect(isSavedViewSurface("tickets")).toBe(false);
    expect(isSavedViewSurface("")).toBe(false);
    expect(isSavedViewSurface(null)).toBe(false);
  });
});
