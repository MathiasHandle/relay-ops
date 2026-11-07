import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  dts: true,
  // Keep `.js` / `.d.ts` output to match `exports` in package.json.
  fixedExtension: false,
})
