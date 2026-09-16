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
        index: resolve(root, "src/index.tsx"),
        model: resolve(root, "src/model.ts"),
        "platform-advisories": resolve(root, "src/PlatformAwareKeybindingEditor.tsx"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      external: [
        "react",
        "@moritzbrantner/input-bindings",
        "@moritzbrantner/input-bindings-web",
        "@moritzbrantner/input-bindings-web/platform-conflicts",
      ],
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
});
