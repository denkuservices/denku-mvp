import { describe, it, expect } from "vitest";
import { normalizeStoreUrl, defaultStoreLabel } from "@/lib/commerce/storeUrl";
import { mapProduct, mapProductList, describeProduct, htmlToText } from "@/lib/commerce/providers/ideasoft/map";

/**
 * The two pure halves of the IdeaSoft integration: what we will call, and what we make of the
 * answer. Both are the places a mistake is silent — an SSRF that "works", or a variant list that
 * quietly reads as in-stock — so both are tested against the shapes the real API documents.
 */

describe("store URL is a security boundary, not formatting", () => {
  it("accepts a bare host and returns the origin", () => {
    const r = normalizeStoreUrl("magazam.myideasoft.com");
    expect(r).toEqual({ ok: true, url: "https://magazam.myideasoft.com", host: "magazam.myideasoft.com" });
  });

  it("strips path, query and trailing slash — a path would be appended to every API call", () => {
    const r = normalizeStoreUrl("https://www.shop.com/panel/auth?x=1");
    expect(r.ok && r.url).toBe("https://www.shop.com");
  });

  it("refuses http — the bearer token would travel in clear text", () => {
    expect(normalizeStoreUrl("http://shop.com").ok).toBe(false);
  });

  it("refuses credentials embedded in the URL", () => {
    expect(normalizeStoreUrl("https://user:pass@shop.com").ok).toBe(false);
  });

  it.each([
    "localhost",
    "https://localhost:3000",
    "https://127.0.0.1",
    "https://10.0.0.5",
    "https://192.168.1.10",
    "https://172.16.4.4",
    "https://169.254.169.254", // cloud metadata — the classic SSRF target
    "https://100.64.0.1",
    "https://box.internal",
    "https://thing.local",
    "https://[::1]",
  ])("refuses %s", (input) => {
    expect(normalizeStoreUrl(input).ok).toBe(false);
  });

  it("still allows a normal public host that merely starts with a blocked-looking octet", () => {
    expect(normalizeStoreUrl("https://11.shop.com").ok).toBe(true);
  });

  it("refuses a bare word with no dot", () => {
    expect(normalizeStoreUrl("shop").ok).toBe(false);
  });

  it("labels a store by its host, without www", () => {
    expect(defaultStoreLabel("https://www.shop.com")).toBe("shop.com");
  });
});

/** A product exactly as the Admin API documents it, trimmed to the fields we read. */
const PARENT = {
  id: 123,
  name: "Kalem",
  fullName: "Kalem",
  slug: "kalem",
  sku: "KAL-1234",
  barcode: "8694567898741",
  stockAmount: 0,
  price1: 10.99,
  currency: { id: 1, abbr: "TL", label: "Türk Lirası" },
  discount: 0,
  discountType: 1,
  status: 1,
  hasOption: 1,
  shortDetails: "Yumuşak uçlu kalem.",
  brand: { id: 4, name: "Idea Kalem" },
  categories: [{ id: 9, name: "Kırtasiye" }],
  detail: { details: "<div><strong>Uç tipi</strong>&nbsp;2B</div>" },
  optionGroups: [{ id: 1, title: "Renk", options: [{ name: "Kırmızı" }] }],
  children: [
    { id: 124, name: "Kalem", fullName: "Kalem Kırmızı", sku: "KAL-1234-K", stockAmount: 3, price1: 10.99, currency: { abbr: "TL" } },
    { id: 125, name: "Kalem", fullName: "Kalem Mavi", sku: "KAL-1234-M", stockAmount: 0, price1: 10.99, currency: { abbr: "TL" } },
  ],
};

describe("mapping IdeaSoft's product shape", () => {
  it("reads the fields an answer is built from", () => {
    const p = mapProduct(PARENT, "https://shop.com")!;
    expect(p.id).toBe("123");
    expect(p.sku).toBe("KAL-1234");
    expect(p.brand).toBe("Idea Kalem");
    expect(p.categories).toEqual(["Kırtasiye"]);
    expect(p.price).toEqual({ amount: 10.99, currency: "TL" });
    expect(p.active).toBe(true);
    expect(p.url).toBe("https://shop.com/kalem");
  });

  it("turns editor HTML into words a prompt can carry", () => {
    expect(mapProduct(PARENT)!.description).toBe("Uç tipi 2B");
    expect(htmlToText("<p>a</p><p>b</p>")).toBe("a b");
    expect(htmlToText("")).toBeNull();
  });

  it("treats variants as first-class: each keeps its own stock and SKU", () => {
    const p = mapProduct(PARENT)!;
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0]).toMatchObject({ name: "Kalem Kırmızı", sku: "KAL-1234-K", stock: 3, inStock: true });
    expect(p.variants[1]).toMatchObject({ name: "Kalem Mavi", stock: 0, inStock: false });
    expect(p.optionGroups).toEqual(["Renk"]);
  });

  it("derives the variant value from the name when the child carries no option groups", () => {
    // This is the documented shape: `fullName` is "parent + variant", and the list payload is not
    // promised to include each child's own optionGroups.
    expect(mapProduct(PARENT)!.variants[0].options).toEqual({ Variant: "Kırmızı" });
  });

  it("applies a percentage discount and keeps the original as the list price", () => {
    const p = mapProduct({ ...PARENT, discount: 10, discountType: 1 })!;
    expect(p.price).toEqual({ amount: 9.89, currency: "TL" });
    expect(p.listPrice).toEqual({ amount: 10.99, currency: "TL" });
  });

  it("applies a flat discount", () => {
    const p = mapProduct({ ...PARENT, discount: 1, discountType: 0 })!;
    expect(p.price?.amount).toBeCloseTo(9.99, 2);
  });

  it("ignores a discount that is not one", () => {
    expect(mapProduct({ ...PARENT, discount: 0 })!.listPrice).toBeNull();
    expect(mapProduct({ ...PARENT, discount: 999, discountType: 0 })!.listPrice).toBeNull();
  });

  it("survives the payload being wrong in every way it could be", () => {
    expect(mapProduct(null)).toBeNull();
    expect(mapProduct({})).toBeNull();
    expect(mapProduct({ id: 1 })!.name).toBe("");
    expect(mapProduct({ id: 1, stockAmount: "not a number" })!.stock).toBe(0);
    expect(mapProductList(null)).toEqual([]);
    expect(mapProductList({ data: [PARENT] })).toHaveLength(1);
    expect(mapProductList([PARENT, null, {}])).toHaveLength(1);
  });

  it("reads a product the store has unpublished as inactive", () => {
    expect(mapProduct({ ...PARENT, status: 0 })!.active).toBe(false);
  });
});

describe("what the model is told", () => {
  it("names every variant with its own stock, so 'we have it' cannot hide an empty size", () => {
    const text = describeProduct(mapProduct(PARENT)!);
    expect(text).toContain("Kalem Kırmızı");
    expect(text).toContain("3 in stock");
    expect(text).toContain("Kalem Mavi");
    expect(text).toContain("out of stock");
  });

  it("says plainly when a product is not published", () => {
    const text = describeProduct(mapProduct({ ...PARENT, status: 0 })!);
    expect(text).toContain("not currently published");
  });

  it("states a simple product's stock as a number", () => {
    const text = describeProduct(mapProduct({ ...PARENT, hasOption: 0, children: [], stockAmount: 7 })!);
    expect(text).toContain("7 in stock");
  });
});
