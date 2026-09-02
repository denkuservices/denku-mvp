import "server-only";

import { ideasoftGet, type IdeasoftClient } from "@/lib/commerce/providers/ideasoft/http";
import { mapProduct, mapProductList } from "@/lib/commerce/providers/ideasoft/map";
import { CommerceReadError } from "@/lib/commerce/errors";
import type { CommerceProduct, CommerceReader, CommerceSearchResult } from "@/lib/commerce/types";

/**
 * Reading a store's catalogue.
 *
 * Only the Admin API (`/admin-api/`) is used. The Store API (`/api/`) exposes the same products
 * but is shaped for a storefront, and mixing the two would mean two mappings of one object.
 *
 * `limit` is capped at 100 by IdeaSoft; we ask for far less, because these results go into a
 * prompt and thirty products is already more than an answer.
 */

const SEARCH_LIMIT = 8;

/**
 * How a search is spelled.
 *
 * `s` is IdeaSoft's free-text search key. It is tried FIRST because it matches how a customer
 * talks ("kırmızı kalem"), and `name` is the fallback for stores where `s` behaves as an exact
 * match. Both are one request; we do not fan out.
 */
async function searchByKey(
  client: IdeasoftClient,
  key: "s" | "name" | "sku" | "barcode",
  value: string,
  limit: number
): Promise<CommerceProduct[] | null> {
  const res = await ideasoftGet<unknown>(client, "/admin-api/products", {
    [key]: value,
    limit,
    // Newest first: a store that re-lists a product usually means the newer row.
    sort: "-id",
  });
  if (!res.ok) return null;
  return mapProductList(res.data, client.storeBaseUrl);
}

export function ideasoftReader(client: IdeasoftClient): CommerceReader {
  return {
    provider: "ideasoft",

    async searchProducts(query: string, limit = SEARCH_LIMIT): Promise<CommerceSearchResult> {
      const q = (query ?? "").trim();
      if (!q) return { products: [], truncated: false };

      // Ask for one more than we intend to show, so "there are more" is a fact rather than a guess.
      const want = Math.min(Math.max(limit, 1), 20);
      let found = await searchByKey(client, "s", q, want + 1);

      // A store where `s` matches nothing may still match on the name column.
      if (found !== null && found.length === 0) {
        found = (await searchByKey(client, "name", q, want + 1)) ?? found;
      }

      // A read failure and an empty catalogue must not look the same to the caller.
      if (found === null) throw new CommerceReadError("upstream");

      return {
        products: found.slice(0, want),
        truncated: found.length > want,
      };
    },

    async getProduct(id: string): Promise<CommerceProduct | null> {
      const res = await ideasoftGet<unknown>(client, `/admin-api/products/${encodeURIComponent(id)}`);
      if (!res.ok) {
        if (res.reason === "not_found") return null;
        throw new CommerceReadError(res.reason);
      }
      return mapProduct(res.data, client.storeBaseUrl);
    },

    async findBySku(sku: string): Promise<CommerceProduct | null> {
      const value = (sku ?? "").trim();
      if (!value) return null;

      // A barcode is what a customer reads off the box; a SKU is what the store calls it. Try the
      // exact fields before falling back to search, so an exact code never returns a near miss.
      for (const key of ["sku", "barcode"] as const) {
        const rows = await searchByKey(client, key, value, 2);
        if (rows === null) throw new CommerceReadError("upstream");
        const exact = rows.find(
          (p) => p.sku?.toLowerCase() === value.toLowerCase() || p.barcode === value
        );
        if (exact) return exact;
        // A variant carries its own SKU; the parent is what the customer should hear about.
        for (const p of rows) {
          if (p.variants.some((v) => v.sku?.toLowerCase() === value.toLowerCase() || v.barcode === value)) {
            return p;
          }
        }
      }
      return null;
    },

    async verify() {
      /**
       * The cheapest call that proves the grant works.
       *
       * `limit=1` on products rather than a dedicated status endpoint: it exercises the exact
       * permission the tools need (catalogue read), so a connection that verifies cannot then fail
       * on the first real question because the app was granted orders but not catalogue.
       */
      const res = await ideasoftGet<unknown>(client, "/admin-api/products", { limit: 1 });
      if (res.ok) {
        const first = mapProductList(res.data, client.storeBaseUrl)[0] ?? null;
        return { ok: true as const, storeName: first?.brand ?? null };
      }
      const reason =
        res.reason === "unauthorized"
          ? "The store rejected these credentials. Check the API app's permissions include catalogue read."
          : res.reason === "not_found"
            ? "The store address answered, but not with the IdeaSoft API. Check the address."
            : res.reason === "rate_limited"
              ? "The store is rate-limiting us right now. Try again in a minute."
              : res.reason === "timeout"
                ? "The store did not answer in time."
                : "The store could not be reached.";
      return { ok: false as const, reason };
    },
  };
}
