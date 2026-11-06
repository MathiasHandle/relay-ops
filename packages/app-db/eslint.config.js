import { defineConfig } from "eslint/config"
import node from "@relay-ops/eslint-config/node"

export default defineConfig(node, {
  // This package owns its database, so it may import Prisma directly.
  rules: { "@typescript-eslint/no-restricted-imports": "off" },
})
