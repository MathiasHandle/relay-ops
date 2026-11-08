import { existsSync } from "node:fs"
import { defineConfig } from "vitest/config"

if (existsSync(".env.test")) {
  process.loadEnvFile(".env.test")
}

export default defineConfig({
  resolve: {
    // `@/` → `src/` from tsconfig `paths`.
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          // resets test DB + generates temporary test private signing key
          globalSetup: ["./src/test/global-setup.ts"],
        },
      },
    ],
  },
})
