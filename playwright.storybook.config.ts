import { defineConfig, devices } from "@playwright/test";

import { browserTestPort } from "./scripts/browser-test-port.ts";

const port = await browserTestPort("INPUT_BINDINGS_STORYBOOK_TEST_PORT");

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results/storybook",
  testDir: ".",
  testMatch: [
    "packages/input-bindings-react/test/**/*.storybook.spec.ts",
    "scripts/storybook-accessibility.spec.ts",
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun scripts/serve-storybook-static.ts",
    env: { STORYBOOK_HOST: "127.0.0.1", STORYBOOK_PORT: String(port) },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `http://127.0.0.1:${port}`,
  },
  projects: [
    {
      name: "storybook-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 1280 },
      },
    },
  ],
});
