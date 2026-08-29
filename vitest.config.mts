import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Node by default; the component suite opts into a DOM per file with a
    // `@vitest-environment happy-dom` docblock. Domain tests have no business
    // paying for a DOM they never touch.
    environment: "node",
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
    setupFiles: ["src/tests/support/setup.ts"],
    // Integration coverage lives in `npm run db:test`, not here. The rules worth
    // integration-testing in this system — RLS, the atomicity of a sale, split
    // payment arithmetic, idempotent retries — are enforced in PostgreSQL, so
    // they are tested by running the real migrations against a real database
    // rather than through a mocked client. This config stays hermetic.
    exclude: ["node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/application/**"],
      reporter: ["text", "html"],
    },
  },
});
