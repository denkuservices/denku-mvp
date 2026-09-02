import "server-only";

import { getActiveConnection } from "@/lib/commerce/connections";
import { readerFor } from "@/lib/commerce/registry";
import { isCommerceReadError } from "@/lib/commerce/errors";
import { describeProduct } from "@/lib/commerce/providers/ideasoft/map";
import type { CommerceProduct } from "@/lib/commerce/types";

/**
 * What the AI is allowed to ask a customer's store, on every channel.
 *
 * These are the commerce twins of `lib/platform/reply/tools.ts` — same `ToolOutcome` contract,
 * same rule that the returned string is repeated to a customer and therefore has to be true and
 * legible without reading a status code.
 *
 * **Read-only, and only the catalogue.** Orders are deliberately absent from this first cut. A
 * customer's order carries their name, address, phone and the amount they paid, and on Web Chat
 * or Telegram the person asking is a stranger: IdeaSoft's `customerEmail` filter turns "my email
 * is X" into a one-line query for someone else's details. Answering that safely needs an order
 * number plus a matching field and per-channel redaction — a design worth doing properly rather
 * than shipping beside a catalogue lookup that needs none of it.
 *
 * **Two tools, not five.** A model given `search_products`, `get_product`, `check_stock`,
 * `list_variants` will chain them and spend three round trips answering "do you have this in red".
 * `find_product` returns the variants and their stock in the SAME result, so the common question
 * is one call.
 */

export interface CommerceToolOutcome {
  ok: boolean;
  /** Handed to the model verbatim. */
  message: string;
}

/** Tool definitions, in the OpenAI shape the reply engine already speaks. */
export const COMMERCE_TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "find_product",
      description:
        "Look up a product in the store's live catalogue: its price, how many are in stock, and every " +
        "colour/size variant with its own stock. Use this whenever the customer asks about a product, " +
        "whether something is available, what it costs, or which sizes or colours you have. " +
        "The numbers come from the store itself — never answer a stock or price question without calling this.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "What the customer called it, in their own words — a product name or part of one. " +
              "Use their language; the store is searched as written.",
          },
          sku: {
            type: "string",
            description: "The product code or barcode, if the customer read one out. More exact than a name.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "search_catalog",
      description:
        "Browse the store for products matching a description, when the customer is not asking about one " +
        "specific item ('what kind of pens do you have?'). Returns a short list with prices and availability. " +
        "If they named one product, use find_product instead.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "What kind of thing they are looking for, in their own words.",
          },
        },
        required: ["query"],
      },
    },
  },
];

export const COMMERCE_TOOL_NAMES = new Set(COMMERCE_TOOL_DEFINITIONS.map((t) => t.function.name));

function clean(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * The sentence the model gets when the store could not be read.
 *
 * Deliberately instructs the next move. A bare "error" leaves the model to invent a recovery, and
 * what it invents is usually a confident guess about stock.
 */
const UNREACHABLE =
  "The store's catalogue could not be reached just now. Tell the customer honestly that you cannot check " +
  "the stock at this moment, and offer to have someone confirm — call create_ticket if they want that.";

/** One line per product, for a browse result. Short: this goes into a prompt, not a catalogue page. */
function summarise(p: CommerceProduct): string {
  const price = p.price ? `${p.price.amount} ${p.price.currency}` : "price not listed";
  const stock =
    p.variants.length > 0
      ? `${p.variants.filter((v) => v.inStock).length}/${p.variants.length} variants in stock`
      : p.inStock
        ? `${p.stock} in stock`
        : "out of stock";
  return `- ${p.name} — ${price} · ${stock}${p.sku ? ` · SKU ${p.sku}` : ""}`;
}

export interface CommerceToolContext {
  orgId: string;
}

export async function executeFindProduct(
  args: Record<string, unknown>,
  ctx: CommerceToolContext
): Promise<CommerceToolOutcome> {
  const sku = clean(args.sku);
  const query = clean(args.query);
  if (!sku && !query) {
    return { ok: false, message: "Ask the customer which product they mean, then call this again." };
  }

  const connection = await getActiveConnection(ctx.orgId);
  if (!connection) return { ok: false, message: UNREACHABLE };
  const reader = readerFor(connection);

  try {
    // An exact code beats a name every time — a customer reading a barcode wants that item.
    if (sku) {
      const exact = await reader.findBySku(sku);
      if (exact) {
        const full = exact.variants.length === 0 ? await hydrate(reader, exact) : exact;
        return { ok: true, message: describeProduct(full) };
      }
    }

    if (!query) {
      return {
        ok: true,
        message: `No product in the store matches the code "${sku}". Ask the customer for the product name.`,
      };
    }

    const found = await reader.searchProducts(query, 5);
    if (found.products.length === 0) {
      return {
        ok: true,
        message:
          `Nothing in the store matches "${query}". Say so plainly — do not suggest it might be available. ` +
          `Offer to check with the team if they think it should be there.`,
      };
    }

    // One clear match: answer it fully, variants and all, so no second call is needed.
    if (found.products.length === 1) {
      const full = await hydrate(reader, found.products[0]);
      return { ok: true, message: describeProduct(full) };
    }

    const lines = found.products.map(summarise).join("\n");
    return {
      ok: true,
      message:
        `Several products match "${query}":\n${lines}\n` +
        `Ask the customer which one they mean, then call find_product again with that exact name.`,
    };
  } catch (err) {
    if (isCommerceReadError(err)) {
      console.warn("[COMMERCE][TOOL][FIND_PRODUCT][UNREACHABLE]", { org_id: ctx.orgId, reason: err.reason });
      return { ok: false, message: UNREACHABLE };
    }
    console.error("[COMMERCE][TOOL][FIND_PRODUCT][ERROR]", err instanceof Error ? err.message : String(err));
    return { ok: false, message: UNREACHABLE };
  }
}

/**
 * Fetch the full product when the list view did not carry its variants.
 *
 * IdeaSoft's list endpoint is not documented to include `children`, and a product answered without
 * its variants reads as "in stock" when only one size is left. One extra request on the one
 * product the customer actually asked about is worth that.
 */
async function hydrate(
  reader: ReturnType<typeof readerFor>,
  product: CommerceProduct
): Promise<CommerceProduct> {
  try {
    const full = await reader.getProduct(product.id);
    return full ?? product;
  } catch {
    return product;
  }
}

export async function executeSearchCatalog(
  args: Record<string, unknown>,
  ctx: CommerceToolContext
): Promise<CommerceToolOutcome> {
  const query = clean(args.query);
  if (!query) return { ok: false, message: "Ask the customer what they are looking for, then call this again." };

  const connection = await getActiveConnection(ctx.orgId);
  if (!connection) return { ok: false, message: UNREACHABLE };

  try {
    const found = await readerFor(connection).searchProducts(query, 8);
    if (found.products.length === 0) {
      return { ok: true, message: `Nothing in the store matches "${query}". Say so plainly.` };
    }
    const lines = found.products.map(summarise).join("\n");
    const more = found.truncated ? "\n(There are more; these are the closest.)" : "";
    return { ok: true, message: `Products matching "${query}":\n${lines}${more}` };
  } catch (err) {
    if (isCommerceReadError(err)) {
      console.warn("[COMMERCE][TOOL][SEARCH][UNREACHABLE]", { org_id: ctx.orgId, reason: err.reason });
    } else {
      console.error("[COMMERCE][TOOL][SEARCH][ERROR]", err instanceof Error ? err.message : String(err));
    }
    return { ok: false, message: UNREACHABLE };
  }
}

export async function executeCommerceTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CommerceToolContext
): Promise<CommerceToolOutcome> {
  switch (name) {
    case "find_product":
      return executeFindProduct(args, ctx);
    case "search_catalog":
      return executeSearchCatalog(args, ctx);
    default:
      return { ok: false, message: `Unknown tool: ${name}` };
  }
}

/**
 * Whether this workspace has a store worth offering tools for.
 *
 * Called once per reply. One indexed read on `(org_id, status)`, and the answer decides whether
 * the model is even told these tools exist — a workspace with no store sees byte-for-byte the
 * behaviour it had before this shipped.
 */
export async function hasCommerceTools(orgId: string): Promise<boolean> {
  return (await getActiveConnection(orgId)) !== null;
}
