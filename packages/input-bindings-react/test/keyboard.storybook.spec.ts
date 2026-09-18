import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const storyBase = "input-bindings-keyboard-view";

test("QWERTZ swaps displayed Y/Z labels while logical Z follows the layout", async ({ page }) => {
  await openStory(page, `${storyBase}--qwertz`);

  await expect(key(page, "KeyY").locator(".ib-key-label")).toHaveText("Z");
  await expect(key(page, "KeyZ").locator(".ib-key-label")).toHaveText("Y");
  await expect(key(page, "KeyY")).toHaveClass(/\bis-used\b/);
  await expect(key(page, "KeyZ")).toHaveClass(/\bis-used\b/);
});

test("AZERTY exposes the common A/Q and Z/W physical-position swaps", async ({ page }) => {
  await openStory(page, `${storyBase}--azerty`);

  await expect(key(page, "KeyQ").locator(".ib-key-label")).toHaveText("A");
  await expect(key(page, "KeyA").locator(".ib-key-label")).toHaveText("Q");
  await expect(key(page, "KeyW").locator(".ib-key-label")).toHaveText("Z");
  await expect(key(page, "KeyZ").locator(".ib-key-label")).toHaveText("W");
});

test("keyboard inspection reports the physical code and matching binding ids", async ({ page }) => {
  await openStory(page, `${storyBase}--qwertz`);

  await key(page, "KeyY").click();

  await expect(page.getByTestId("inspection")).toHaveText("KeyY · undo.logical");
});

test("pressed, selected, highlighted, and conflict states remain visible", async ({ page }) => {
  await openStory(page, `${storyBase}--interaction-states`);

  await expect(key(page, "KeyW")).toHaveClass(/\bis-pressed\b/);
  await expect(key(page, "KeyZ")).toHaveClass(/\bis-selected\b/);
  await expect(key(page, "KeyZ")).toHaveClass(/\bis-highlighted\b/);
  await expect(key(page, "KeyS")).toHaveClass(/\bis-conflict\b/);
});

test("all keyboard layout stories render without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const story of ["qwerty", "qwertz", "azerty", "dvorak", "interaction-states"]) {
    await openStory(page, `${storyBase}--${story}`);
    await expect(page.getByLabel("Keyboard binding overview")).toBeVisible();
    await expect(page.locator(".ib-keyboard-row")).toHaveCount(6);
  }

  expect(errors).toEqual([]);
});

function key(page: Page, code: string) {
  return page.locator(`button[title^="${code}:"]`);
}

async function openStory(page: Page, storyId: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toBeVisible();
  await expect(page.getByLabel("Keyboard binding overview")).toBeVisible();
}
