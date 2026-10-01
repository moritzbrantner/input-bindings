import path from "node:path";
import { fileURLToPath } from "node:url";

import type { StorybookConfig } from "@storybook/react-vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const aliases = {
  "@moritzbrantner/input-bindings": path.resolve(root, "packages/input-bindings/src/public.ts"),
  "@moritzbrantner/input-bindings-runtime": path.resolve(
    root,
    "packages/input-bindings-runtime/src/index.ts",
  ),
  "@moritzbrantner/input-bindings-web": path.resolve(
    root,
    "packages/input-bindings-web/src/index.ts",
  ),
};

const config: StorybookConfig = {
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../packages/input-bindings-react/storybook/**/*.stories.@(ts|tsx)"],
  viteFinal(viteConfig) {
    const existingAliases = viteConfig.resolve?.alias;
    viteConfig.resolve = {
      ...viteConfig.resolve,
      alias: [
        ...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })),
        ...(Array.isArray(existingAliases)
          ? existingAliases
          : Object.entries(existingAliases ?? {}).map(([find, replacement]) => ({
              find,
              replacement,
            }))),
      ],
    };
    return viteConfig;
  },
};

export default config;
