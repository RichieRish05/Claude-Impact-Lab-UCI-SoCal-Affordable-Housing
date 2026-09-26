import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    // The Neon Auth SDK imports extensionless Next subpaths (`next/headers`),
    // which Node's ESM resolver rejects. Let Vite resolve them, as Next does.
    server: { deps: { inline: ["@neondatabase/auth"] } },
  },
});
