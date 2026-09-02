/**
 * IdeaSoft's product shape → ours.
 *
 * Pure, so it can be tested against real payloads with no network and no database. Everything
 * here is defensive: this data crosses a trust boundary (another company's API, on a customer's
 * server, behind Cloudflare) and a single unexpected null must not take a tool call down.
 *
 * **The variant model is the thing worth understanding.** IdeaSoft does not carry colour and size
 * as attributes of one product. A product with variants has `hasOption: 1` and a `children[]`
 * array, and each child is a full product in its own right — its own `sku`, its own `stockAmount`,
 * its own `price1`, and a `fullName` that reads "Kalem Kırmızı". The axes themselves live in
 * `optionGroups[]`, whose `title` is "Renk" or "Beden".
 *
 * So "do you have the red one in 42?" is answered from `children`, and flattening variants into a
 * string would throw away the only numbers the customer actually asked for.
 */

import type { CommercePrice, CommerceProduct, CommerceVariant } from "@/lib/commerce/types";

/* eslint-disable @typescript-eslint/no-explicit-any */

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** IdeaSoft uses 0/1 integers for booleans, and sometimes the string versions of them. */
function flag(v: unknown): boolean {
  return v === 1 || v === "1" || v === true;
}

/**
 * Store descriptions are editor HTML — tables, inline styles, entities. The AI needs the words.
 * Truncated because a product description can be kilobytes and it is going into a prompt.
 */
export function htmlToText(html: unknown, limit = 600): string | null {
  const raw = typeof html === "string" ? html : "";
  if (!raw.trim()) return null;
  const text = raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function priceOf(node: any): CommercePrice | null {
  const amount = num(node?.price1, NaN);
  if (!Number.isFinite(amount)) return null;
  const currency = str(node?.currency?.abbr) ?? str(node?.currency?.label) ?? "TL";
  return { amount, currency };
}

/**
 * What the customer pays after the store's own discount.
 *
 * `discountType` is 0 for a flat amount and 1 for a percentage, per the schema. Returns null when
 * there is no discount, so a caller can tell "no discount" from "discounted to the same price".
 */
function discountedPrice(node: any, base: CommercePrice | null): CommercePrice | null {
  if (!base) return null;
  const discount = num(node?.discount, 0);
  if (discount <= 0) return null;
  const isPercent = num(node?.discountType, 0) === 1;
  const value = isPercent ? base.amount * (1 - discount / 100) : base.amount - discount;
  if (!Number.isFinite(value) || value < 0 || value >= base.amount) return null;
  return { amount: Math.round(value * 100) / 100, currency: base.currency };
}

/**
 * The variant axes for one child, best-effort.
 *
 * IdeaSoft's LIST payload does not reliably carry the child's own option→value mapping, and the
 * documentation does not promise it. When it is there we read it; when it is not, the child's
 * `fullName` still names the variant ("Kalem Kırmızı"), which is what a customer says out loud.
 * Guessing an axis we cannot see would be worse than leaving it empty.
 */
function optionsOf(child: any, parentName: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const direct = Array.isArray(child?.optionGroups) ? child.optionGroups : [];
  for (const group of direct) {
    const title = str(group?.title);
    const options = Array.isArray(group?.options) ? group.options : [];
    const value = str(options[0]?.name) ?? str(options[0]?.title) ?? str(options[0]?.value);
    if (title && value) out[title] = value;
  }
  if (Object.keys(out).length > 0) return out;

  // Fall back to the difference between the child's full name and the parent's — "Kalem Kırmızı"
  // minus "Kalem" is "Kırmızı". Recorded under a neutral key because we do not know the axis.
  const full = str(child?.fullName);
  if (full && parentName && full.toLowerCase().startsWith(parentName.toLowerCase())) {
    const rest = full.slice(parentName.length).trim();
    if (rest) out.Variant = rest;
  }
  return out;
}

export function mapVariant(child: any, parentName: string | null): CommerceVariant {
  const stock = num(child?.stockAmount, 0);
  const base = priceOf(child);
  return {
    id: String(child?.id ?? ""),
    name: str(child?.fullName) ?? str(child?.name) ?? "",
    sku: str(child?.sku),
    barcode: str(child?.barcode),
    stock,
    inStock: stock > 0,
    price: discountedPrice(child, base) ?? base,
    options: optionsOf(child, parentName),
  };
}

export function mapProduct(node: any, storeBaseUrl?: string): CommerceProduct | null {
  if (!node || typeof node !== "object") return null;
  const id = node.id === undefined || node.id === null ? "" : String(node.id);
  if (!id) return null;

  const name = str(node.fullName) ?? str(node.name) ?? "";
  const stock = num(node.stockAmount, 0);
  const base = priceOf(node);
  const discounted = discountedPrice(node, base);

  const children = Array.isArray(node.children) ? node.children : [];
  const variants = children
    .map((c: any) => mapVariant(c, str(node.name)))
    .filter((v: CommerceVariant) => v.id && v.name);

  const optionGroups = (Array.isArray(node.optionGroups) ? node.optionGroups : [])
    .map((g: any) => str(g?.title))
    .filter((t: string | null): t is string => Boolean(t));

  const categories = (Array.isArray(node.categories) ? node.categories : [])
    .map((c: any) => str(c?.name))
    .filter((n: string | null): n is string => Boolean(n));

  const slug = str(node.slug);

  return {
    id,
    name,
    sku: str(node.sku),
    barcode: str(node.barcode),
    description: htmlToText(node.detail?.details) ?? str(node.shortDetails),
    brand: str(node.brand?.name),
    categories,
    stock,
    inStock: stock > 0,
    // `price` is what the customer pays; `listPrice` is what it was struck through from.
    price: discounted ?? base,
    listPrice: discounted ? base : null,
    active: flag(node.status),
    variants,
    optionGroups,
    url: slug && storeBaseUrl ? `${storeBaseUrl.replace(/\/$/, "")}/${slug}` : null,
  };
}

/**
 * IdeaSoft list endpoints answer with a bare array. Some deployments wrap it — accept both rather
 * than discovering the difference in front of a customer.
 */
export function mapProductList(payload: unknown, storeBaseUrl?: string): CommerceProduct[] {
  const arr = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : Array.isArray((payload as any)?.products)
        ? (payload as any).products
        : [];
  return arr.map((n: any) => mapProduct(n, storeBaseUrl)).filter((p: CommerceProduct | null): p is CommerceProduct => p !== null);
}

/**
 * How one product reads back to a model.
 *
 * This string is what the AI repeats to a customer, so it states stock as a NUMBER where the
 * number is small ("3 left") and never invents availability. Variants are listed with their own
 * stock, because "we have it" when only the XL is left is the answer that produces a complaint.
 */
export function describeProduct(p: CommerceProduct): string {
  const lines: string[] = [];
  const price = p.price ? `${p.price.amount} ${p.price.currency}` : "price not listed";
  const was = p.listPrice ? ` (was ${p.listPrice.amount} ${p.listPrice.currency})` : "";
  lines.push(`${p.name} — ${price}${was}${p.sku ? ` · SKU ${p.sku}` : ""}`);

  if (!p.active) lines.push("This product is not currently published in the store.");

  if (p.variants.length > 0) {
    const axes = p.optionGroups.length > 0 ? ` (${p.optionGroups.join(", ")})` : "";
    lines.push(`Variants${axes}:`);
    for (const v of p.variants.slice(0, 25)) {
      const vPrice = v.price ? `${v.price.amount} ${v.price.currency}` : "";
      const availability = v.stock > 0 ? `${v.stock} in stock` : "out of stock";
      lines.push(`- ${v.name}${vPrice ? ` · ${vPrice}` : ""} · ${availability}${v.sku ? ` · SKU ${v.sku}` : ""}`);
    }
    if (p.variants.length > 25) lines.push(`- …and ${p.variants.length - 25} more variants`);
  } else {
    lines.push(p.inStock ? `${p.stock} in stock.` : "Out of stock.");
  }

  if (p.brand) lines.push(`Brand: ${p.brand}`);
  if (p.categories.length > 0) lines.push(`Category: ${p.categories.slice(0, 3).join(", ")}`);
  if (p.description) lines.push(`Description: ${p.description}`);
  return lines.join("\n");
}
