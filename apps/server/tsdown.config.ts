import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/main.ts", "src/publisher.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  // Keep `.js` output; the package is `"type": "module"`.
  fixedExtension: false,
})
