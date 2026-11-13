import { defineConfig } from "tsdown"

export default defineConfig({
  // one entry per subpath export in package.json
  entry: {
    "queue/index": "src/queue/index.ts",
  },
  format: "esm",
  platform: "node",
  target: "node24",
  sourcemap: true,
  dts: true,
  fixedExtension: false,
})
