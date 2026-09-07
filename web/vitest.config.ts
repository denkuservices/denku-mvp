import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for Denku unit / characterization tests (R-037).
 *
 * - Node environment: everything under test is server-side domain logic.
 * - `@/…` is aliased to `src/…` to match tsconfig paths.
 * - `server-only` is aliased to a no-op stub so modules that import it
 *   (e.g. the service-role client) can be loaded/mocked under Node.
 * - `next-intl/server` is aliased to a stub that reads the real message files, so a
 *   server action can look up customer-facing copy without the react-server condition.
 * - Tests live in `test/**` and never touch a live database — all Supabase
 *   access is mocked (see `test/helpers/supabaseMock.ts`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/helpers/server-only-stub.ts", import.meta.url)),
      // Published behind the `react-server` condition; without this a server action that asks
      // for a translator throws "not supported in Client Components" under Node.
      "next-intl/server": fileURLToPath(
        new URL("./test/helpers/next-intl-server-stub.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
