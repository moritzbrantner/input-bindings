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
        index: resolve(root, "src/public.ts"),
        core: resolve(root, "src/index.ts"),
        registry: resolve(root, "src/registry.ts"),
        persistence: resolve(root, "src/persistence.ts"),
        platform: resolve(root, "src/platform.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
