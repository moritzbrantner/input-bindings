import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: {
        index: resolve(root, "src/index.ts"),
        "platform-conflicts": resolve(root, "src/platformCatalog.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "@moritzbrantner/input-bindings",
        "@moritzbrantner/input-bindings-runtime",
      ],
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
