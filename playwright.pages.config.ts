import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results/pages",
  testDir: ".",
  testMatch: "packages/input-bindings-demo/test/**/*.pages.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173/input-bindings/",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run preview --workspace @moritzbrantner/input-bindings-demo",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:4173/input-bindings/",
  },
  projects: [
    {
      name: "pages-mobile",
      use: {
        ...devices["Pixel 5"],
      },
    },
  ],
});
