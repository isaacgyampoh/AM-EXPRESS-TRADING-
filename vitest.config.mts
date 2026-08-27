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
    // Infrastructure and end-to-end suites need a live Supabase project and are
    // opted into separately, so the default `npm test` stays fast and hermetic.
    exclude: ["src/tests/integration/**", "src/tests/e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/domain/**", "src/application/**"],
      reporter: ["text", "html"],
    },
  },
});
