import { defineConfig, devices } from "@playwright/test";

import { browserTestPort } from "./scripts/browser-test-port.ts";

const port = await browserTestPort("INPUT_BINDINGS_PAGES_TEST_PORT");

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results/pages",
  testDir: ".",
  testMatch: "packages/input-bindings-demo/test/**/*.pages.spec.ts",
  use: {
    baseURL: `http://127.0.0.1:${port}/input-bindings/`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `bun run --cwd packages/input-bindings-demo preview --port ${port} --strictPort`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}/input-bindings/`,
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
