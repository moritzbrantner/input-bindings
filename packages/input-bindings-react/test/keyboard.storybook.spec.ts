import { expect, test } from "@playwright/test";

import type { Locator, Page } from "@playwright/test";

const storyBase = "input-bindings-keyboard-view";

test("QWERTY keeps logical and physical Z on the same displayed position", async ({ page }) => {
  await openStory(page, `${storyBase}--qwerty`);

  await expect(key(page, "KeyZ").locator(".ib-key-label")).toHaveText("Z");
  await expect(key(page, "KeyZ")).toHaveAttribute("title", "KeyZ: 2 bindings");
  await expect(key(page, "KeyY")).toHaveAttribute("title", "KeyY: unused");
});

test("QWERTZ swaps displayed Y/Z labels while logical Z follows the layout", async ({ page }) => {
  await openStory(page, `${storyBase}--qwertz`);

  await expect(key(page, "KeyY").locator(".ib-key-label")).toHaveText("Z");
  await expect(key(page, "KeyZ").locator(".ib-key-label")).toHaveText("Y");
  await expect(key(page, "KeyY")).toHaveAttribute("title", "KeyY: 1 binding");
  await expect(key(page, "KeyZ")).toHaveAttribute("title", "KeyZ: 1 binding");
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

test("Dvorak and Colemak expose distinct logical label positions", async ({ page }) => {
  await openStory(page, `${storyBase}--dvorak`);
  await expect(key(page, "KeyS").locator(".ib-key-label")).toHaveText("O");
  await expect(key(page, "KeyD").locator(".ib-key-label")).toHaveText("E");

  await openStory(page, `${storyBase}--colemak`);
  await expect(key(page, "KeyE").locator(".ib-key-label")).toHaveText("F");
  await expect(key(page, "KeyK").locator(".ib-key-label")).toHaveText("E");
});

test("keyboard inspection is operable without a pointer", async ({ page }) => {
  await openStory(page, `${storyBase}--qwertz`);

  const logicalZ = key(page, "KeyY");
  await logicalZ.focus();
  await expect(logicalZ).toBeFocused();
  await expect(logicalZ).toHaveAccessibleName("Z, 1 binding");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("inspection")).toHaveText("KeyY · undo.logical");

  await key(page, "KeyZ").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("inspection")).toHaveText("KeyZ · physical.z");
});

test("pressed, selected, highlighted, and conflict states remain visible", async ({ page }) => {
  await openStory(page, `${storyBase}--interaction-states`);

  await expect(key(page, "KeyW")).toHaveClass(/\bis-pressed\b/);
  await expect(key(page, "KeyZ")).toHaveClass(/\bis-selected\b/);
  await expect(key(page, "KeyZ")).toHaveClass(/\bis-highlighted\b/);
  await expect(key(page, "KeyS")).toHaveClass(/\bis-conflict\b/);
});

test("layout comparison renders the same physical keyboard under every fixture", async ({ page }) => {
  await openStory(page, `${storyBase}--layout-comparison`, 5);

  const layouts = ["qwerty", "qwertz", "azerty", "dvorak", "colemak"] as const;
  for (const layout of layouts) {
    const card = page.locator(`[data-layout="${layout}"]`);
    await expect(card).toBeVisible();
    await expect(card.locator(".ib-keyboard-row")).toHaveCount(6);
  }

  await expect(layoutKey(page, "qwertz", "KeyY").locator(".ib-key-label")).toHaveText("Z");
  await expect(layoutKey(page, "azerty", "KeyQ").locator(".ib-key-label")).toHaveText("A");
  await expect(layoutKey(page, "dvorak", "KeyS").locator(".ib-key-label")).toHaveText("O");
  await expect(layoutKey(page, "colemak", "KeyE").locator(".ib-key-label")).toHaveText("F");
});

test("narrow viewports keep the physical keyboard scrollable without page-level overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 800 });
  await openStory(page, `${storyBase}--qwertz`);

  const metrics = await page.getByLabel("Keyboard binding overview").evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));

  expect(metrics.scrollWidth).toBeGreaterThan(metrics.clientWidth);
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test("all keyboard layout stories render without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const story of ["qwerty", "qwertz", "azerty", "dvorak", "colemak", "interaction-states"]) {
    await openStory(page, `${storyBase}--${story}`);
  }
  await openStory(page, `${storyBase}--layout-comparison`, 5);

  expect(errors).toEqual([]);
});

function key(page: Page, code: string): Locator {
  return page.locator(`button[title^="${code}:"]`);
}

function layoutKey(page: Page, layout: string, code: string): Locator {
  return page.locator(`[data-layout="${layout}"] button[title^="${code}:"]`);
}

async function openStory(page: Page, storyId: string, keyboardCount = 1) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toBeVisible();
  const keyboards = page.getByLabel("Keyboard binding overview");
  await expect(keyboards).toHaveCount(keyboardCount);
  await expect(keyboards.first()).toBeVisible();
}
