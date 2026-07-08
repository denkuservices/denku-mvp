import { vi } from "vitest";

/**
 * Minimal chainable Supabase query-builder mock.
 *
 * Every builder method (`select`, `insert`, `eq`, …) records its call into `log`
 * and returns the same builder, so a full chain like
 * `.from("t").select("*").eq("org_id", id).is("released_at", null).gt(...)`
 * resolves to `result`. The builder is awaitable (thenable) AND exposes
 * `single()`/`maybeSingle()` returning `result`, covering both the
 * `await qb...` and `await qb....single()` call styles used in the codebase.
 *
 * `log` lets a test assert which operations ran — e.g. that `.eq("org_id", …)`
 * was applied (org-scoping) or that `.insert` was NOT called (idempotency).
 */
export type ChainCall = [method: string, args: unknown[]];

export function makeChain(result: unknown, log: ChainCall[] = []) {
  const chain: Record<string, unknown> = {};
  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "is", "gt", "gte", "lt", "lte", "in", "match", "or",
    "order", "limit", "range",
  ];
  for (const m of chainMethods) {
    chain[m] = vi.fn((...args: unknown[]) => {
      log.push([m, args]);
      return chain;
    });
  }
  chain.single = vi.fn(() => {
    log.push(["single", []]);
    return Promise.resolve(result);
  });
  chain.maybeSingle = vi.fn(() => {
    log.push(["maybeSingle", []]);
    return Promise.resolve(result);
  });
  // Awaitable: `await chain` resolves to `result`.
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

/** Returns true if `log` contains an `.eq("org_id", orgId)` call. */
export function hasOrgScope(log: ChainCall[], orgId: string): boolean {
  return log.some(([m, args]) => m === "eq" && args[0] === "org_id" && args[1] === orgId);
}

/** Returns true if any `.insert(...)` was recorded. */
export function didInsert(log: ChainCall[]): boolean {
  return log.some(([m]) => m === "insert");
}
