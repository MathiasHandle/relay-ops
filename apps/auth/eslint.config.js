import { defineConfig } from "eslint/config"
import node from "@relay-ops/eslint-config/node"

export default defineConfig(node, {
  rules: { "@typescript-eslint/no-restricted-imports": "off" },
})
