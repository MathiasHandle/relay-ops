// Shared rules for all TypeScript packages (runtime-agnostic).
import js from "@eslint/js"
import { defineConfig } from "eslint/config"
import prettier from "eslint-config-prettier"
import importX from "eslint-plugin-import-x"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import unicorn from "eslint-plugin-unicorn"
import tseslint from "typescript-eslint"

export default defineConfig(
  { ignores: ["**/dist/**", "**/generated/**", "**/.generated/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    plugins: {
      "import-x": importX,
      "simple-import-sort": simpleImportSort,
      unicorn,
    },
    rules: {
      "no-console": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message:
            "Do not use enums. Use a union type or an `as const` object instead.",
        },
      ],

      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // Types always via a separate `import type { ... }` (auto-fixable).
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      // Inline `import { type X, Y }` → separate `import type { X }` (auto-fixable).
      "import-x/consistent-type-specifier-style": ["error", "prefer-top-level"],
      // The Prisma client may only be imported via @relay-ops/app-db.
      // Packages with their own database (packages/app-db, apps/auth) turn this rule off.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@prisma/*",
                ".prisma/*",
                "**/generated/prisma/**",
                "**/.generated/**",
              ],
              message: "Import the Prisma client via @relay-ops/app-db.",
            },
          ],
        },
      ],

      "unicorn/no-await-in-promise-methods": "error",
      // File names: kebab-case with an optional role suffix (oauth.error-handler.ts).
      "unicorn/filename-case": ["error", { case: "kebabCase" }],

      // Order: side-effect imports, values (packages, @relay-ops/*, @/ alias, relative),
      // types (same order). Groups are separated by a blank line.
      // `\u0000` as prefix = side-effect import, as suffix = `import type`.
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"],
            ["^node:", "^@?\\w", "^@relay-ops/", "^@/", "^", "^\\."],
            [
              "^node:.*\\u0000$",
              "^@?\\w.*\\u0000$",
              "^@relay-ops/.*\\u0000$",
              "^@/.*\\u0000$",
              "\\u0000$",
              "^\\..*\\u0000$",
            ],
          ],
        },
      ],
    },
  },
  prettier,
)
