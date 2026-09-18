import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  outputDir: "test-results/storybook",
  testDir: ".",
  testMatch: "packages/input-bindings-react/test/**/*.storybook.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:6017",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run storybook -- --host 127.0.0.1 --port 6017 --ci",
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:6017",
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
