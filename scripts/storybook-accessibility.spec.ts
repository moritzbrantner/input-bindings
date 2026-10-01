import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

type StoryIndex = {
  entries: Record<string, { id: string; type: "story" | "docs" }>;
};

const index: StoryIndex = JSON.parse(
  readFileSync(new URL("../storybook-static/index.json", import.meta.url), "utf8"),
);
const stories = Object.values(index.entries)
  .filter((entry) => entry.type === "story")
  .sort((left, right) => left.id.localeCompare(right.id, "en"));

test("the built Storybook includes auditable stories", () => {
  expect(stories.length).toBeGreaterThan(0);
});

for (const story of stories) {
  test(`accessibility: ${story.id}`, async ({ page }, testInfo) => {
    await page.goto(`/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`);
    const root = page.locator("#storybook-root");
    await expect(root).toBeVisible();
    await expect(root).not.toBeEmpty();
    const report = await new AxeBuilder({ page })
      .include("#storybook-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await testInfo.attach("accessibility.json", {
      body: JSON.stringify(report, null, 2),
      contentType: "application/json",
    });
    expect(report.violations).toEqual([]);
  });
}
