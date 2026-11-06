// Config for Node.js apps and packages.
import { defineConfig } from "eslint/config"
import globals from "globals"
import base from "./base.js"

export default defineConfig(base, {
  languageOptions: {
    globals: globals.node,
  },
})
