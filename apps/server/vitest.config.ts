import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    // `@/` → `src/` from tsconfig `paths`
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
    ],
  },
})
