import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    // Infrastructure and integration suites need a live Supabase project and
    // are opted into explicitly (npm run test:integration), so the default
    // `npm test` stays fast and hermetic.
    exclude: ["src/tests/integration/**", "src/tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/application/**"],
      reporter: ["text", "html"],
    },
  },
});
