import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Architecture enforcement.
 *
 * The dependency direction is checked by the linter, not left to whoever
 * remembers the diagram:
 *
 *   Presentation -> Application -> Domain
 *                   Infrastructure -> Domain (implements its contracts)
 *
 * Two policies carry most of the weight. The domain may not import any
 * external package at all, which mechanically keeps React, Next, Supabase and
 * browser APIs out of the business rules. And nothing outside `infrastructure`
 * may import Supabase, which is what stops `supabase.from("products")`
 * reappearing inside a component six months from now.
 *
 * The `import/resolver` setting below is load-bearing. Without the TypeScript
 * resolver the plugin cannot resolve extensionless TS imports, treats every
 * dependency as unknown, and silently passes everything — a green lint that
 * enforces nothing. `npm run test:architecture` lints deliberate violations
 * and fails if they are NOT reported, so that failure mode cannot come back
 * unnoticed.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    plugins: { boundaries },
    settings: {
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
        node: { extensions: [".js", ".jsx", ".ts", ".tsx"] },
      },
      "boundaries/elements": [
        { type: "domain", pattern: "src/domain" },
        { type: "application", pattern: "src/application" },
        { type: "infrastructure", pattern: "src/infrastructure" },
        { type: "presentation", pattern: "src/presentation" },
        { type: "app", pattern: "src/app" },
        { type: "lib", pattern: "src/lib" },
        { type: "tests", pattern: "src/tests" },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          // Without this the rule only inspects imports between local
          // elements, and every `import ... from "@supabase/..."` sails past.
          checkAllOrigins: true,
          policies: [
            // Domain is the innermost circle: it depends on nothing but itself.
            {
              from: { element: { type: "domain" } },
              allow: { to: { element: { type: "domain" } } },
            },

            // Application orchestrates the domain, plus pure helpers in lib.
            {
              from: { element: { type: "application" } },
              allow: {
                to: {
                  element: { types: { anyOf: ["application", "domain", "lib"] } },
                },
              },
            },

            // Infrastructure implements domain and application contracts.
            {
              from: { element: { type: "infrastructure" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["infrastructure", "application", "domain", "lib"],
                    },
                  },
                },
              },
            },

            // Presentation talks to the application layer, never to a database.
            {
              from: { element: { type: "presentation" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: ["presentation", "application", "domain", "lib"],
                    },
                  },
                },
              },
            },

            // The app router is the composition root: it may wire everything.
            {
              from: { element: { type: "app" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "app",
                        "presentation",
                        "application",
                        "infrastructure",
                        "domain",
                        "lib",
                      ],
                    },
                  },
                },
              },
            },

            {
              from: { element: { type: "lib" } },
              allow: { to: { element: { type: "lib" } } },
            },

            {
              from: { element: { type: "tests" } },
              allow: {
                to: {
                  element: {
                    types: {
                      anyOf: [
                        "tests",
                        "domain",
                        "application",
                        "infrastructure",
                        "presentation",
                        "lib",
                      ],
                    },
                  },
                },
              },
            },

            // Every layer may use npm packages and Node built-ins...
            { allow: { to: { module: { origin: "external" } } } },
            { allow: { to: { module: { origin: "core" } } } },

            // ...except the domain, which stays framework-independent. No npm
            // packages, and no Node built-ins either: business rules that
            // reach for `node:fs` are no longer portable business rules.
            {
              from: { element: { type: "domain" } },
              disallow: { to: { module: { origin: "external" } } },
            },
            {
              from: { element: { type: "domain" } },
              disallow: { to: { module: { origin: "core" } } },
            },

            // And Supabase belongs to infrastructure alone.
            {
              from: {
                element: {
                  types: {
                    anyOf: ["domain", "application", "presentation", "lib"],
                  },
                },
              },
              disallow: {
                to: { module: { origin: "external", source: "@supabase/*" } },
              },
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "public/sw.js",
    "src/tests/architecture/fixtures/**",
  ]),
]);

export default eslintConfig;
