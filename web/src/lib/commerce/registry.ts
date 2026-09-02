import "server-only";

import { ideasoftReader } from "@/lib/commerce/providers/ideasoft/products";
import type { CommerceConnection, CommerceProvider, CommerceReader } from "@/lib/commerce/types";

/**
 * Provider registry — the lookup that makes the second e-commerce backend cheap.
 *
 * Same rule as `lib/platform/adapters/registry.ts`: a new provider is a folder under
 * `providers/` plus a line here. Nothing above this file — not the tools, not the prompt, not the
 * Settings page — learns a provider's name.
 *
 * Provider metadata lives here too, for the same reason channel metadata lives in
 * `lib/platform/channels.ts`: a label duplicated into a component is a label that goes stale.
 */

export interface ProviderMeta {
  id: CommerceProvider;
  /** Customer-facing name — the ONLY place this string is defined. */
  label: string;
  /** One line for the connect card. */
  description: string;
  /**
   * Whether we may sell this. `false` means: usable, real, and not yet proven against a live
   * store — never advertise it as finished (the honesty rule from `lib/platform/channels.ts`).
   */
  productionReady: boolean;
  /** Where the customer creates the API app in their own admin panel. */
  credentialPath: string;
  docsUrl: string;
}

const PROVIDERS: Record<CommerceProvider, ProviderMeta> = {
  ideasoft: {
    id: "ideasoft",
    label: "IdeaSoft",
    description: "Read your product catalogue, stock and variants so your AI can answer about them.",
    productionReady: false,
    credentialPath: "Entegrasyonlar → API → Ekle",
    docsUrl: "https://apidoc.ideasoft.dev",
  },
};

export function providerMeta(provider: CommerceProvider): ProviderMeta {
  return PROVIDERS[provider];
}

export function allProviders(): ProviderMeta[] {
  return Object.values(PROVIDERS);
}

export function isCommerceProvider(value: unknown): value is CommerceProvider {
  return typeof value === "string" && value in PROVIDERS;
}

/**
 * The reader for a connection.
 *
 * Takes the connection rather than ids so a caller cannot accidentally pair one store's id with
 * another store's URL — the two must always travel together.
 */
export function readerFor(connection: Pick<CommerceConnection, "id" | "provider" | "storeBaseUrl">): CommerceReader {
  switch (connection.provider) {
    case "ideasoft":
      return ideasoftReader({ connectionId: connection.id, storeBaseUrl: connection.storeBaseUrl });
    default: {
      // Exhaustiveness: adding a provider to the union without a reader fails the build here,
      // rather than at runtime in front of a customer.
      const never: never = connection.provider;
      throw new Error(`No commerce reader for provider: ${String(never)}`);
    }
  }
}
