/**
 * The commerce vocabulary — deliberately provider-free.
 *
 * Nothing below names IdeaSoft, for the same reason nothing in `lib/platform/reply/types.ts`
 * names Telegram: the second provider must cost an adapter, not a rewrite. The tool layer, the
 * prompt, and the Inbox speak only these shapes.
 *
 * The normalization is opinionated about ONE thing: a variant is a first-class product. IdeaSoft
 * models colour and size as child products with their own SKU, stock and price, and flattening
 * that into a string would throw away the only numbers a customer actually asks for ("do you have
 * the red one in 42?").
 */

export type CommerceProvider = "ideasoft";

/** Money, kept as a pair so nothing has to guess the currency from the workspace's locale. */
export interface CommercePrice {
  amount: number;
  /** ISO-ish code as the store reports it: "TL", "USD", "EUR". */
  currency: string;
}

/**
 * One buyable thing: either a standalone product or one variant of one.
 *
 * `stock` is a number and `inStock` is derived, because "3 left" and "in stock" are different
 * answers and the AI should be able to give the first one.
 */
export interface CommerceVariant {
  id: string;
  /** What the customer would recognise — "Kalem Kırmızı", not "Kalem". */
  name: string;
  sku: string | null;
  barcode: string | null;
  stock: number;
  inStock: boolean;
  price: CommercePrice | null;
  /**
   * The variant axes, resolved to label→value where the provider exposes them:
   * `{ "Renk": "Kırmızı", "Beden": "42" }`. Empty when the store does not use option groups —
   * the name still carries the distinction.
   */
  options: Record<string, string>;
}

export interface CommerceProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  /** Plain text, tags stripped, truncated — never the store's raw description HTML. */
  description: string | null;
  brand: string | null;
  categories: string[];
  /** The parent's own stock and price. For a product with variants, read `variants` instead. */
  stock: number;
  inStock: boolean;
  price: CommercePrice | null;
  /** Sale price when the store has a discount on it, else null. */
  listPrice: CommercePrice | null;
  /** Whether the store still shows this product at all. Inactive products must not be quoted. */
  active: boolean;
  variants: CommerceVariant[];
  /** The names of the variant axes this product uses: ["Renk", "Beden"]. */
  optionGroups: string[];
  url: string | null;
}

/** What a search returns — the same shape, so a "found one" answer needs no second call. */
export interface CommerceSearchResult {
  products: CommerceProduct[];
  /** True when the store had more matches than we asked for. */
  truncated: boolean;
}

/**
 * The read surface a provider must implement.
 *
 * Read-only on purpose. Writing to a customer's store (cancel an order, change a status) is an
 * authorization question — a capability-matrix row and an owner's explicit opt-in — not a method
 * that appears here because it was convenient.
 */
export interface CommerceReader {
  provider: CommerceProvider;
  /** Free-text search: a name, part of a name, or a SKU. */
  searchProducts(query: string, limit: number): Promise<CommerceSearchResult>;
  /** Everything about one product, including its variants. */
  getProduct(id: string): Promise<CommerceProduct | null>;
  /** Exact SKU or barcode lookup — what a customer reads off a label. */
  findBySku(sku: string): Promise<CommerceProduct | null>;
  /** A cheap call that proves the credentials work. Used by Connect and by the health check. */
  verify(): Promise<{ ok: true; storeName: string | null } | { ok: false; reason: string }>;
}

/** A connection as the rest of the app sees it — never carrying a decrypted secret. */
export interface CommerceConnection {
  id: string;
  orgId: string;
  provider: CommerceProvider;
  storeBaseUrl: string;
  storeLabel: string | null;
  clientId: string;
  status: "pending" | "connected" | "revoked" | "error";
  grantedScope: string | null;
  lastError: string | null;
  lastVerifiedAt: string | null;
  accessExpiresAt: string | null;
  refreshExpiresAt: string | null;
  createdAt: string;
}
