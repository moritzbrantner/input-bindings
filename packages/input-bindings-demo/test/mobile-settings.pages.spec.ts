import { expect, test } from "@playwright/test";

test("mobile Pages settings use touch controls instead of a keyboard map", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Controls" })).toBeVisible();

  const taskTabs = page.getByRole("tablist", { name: "Input settings tasks" });
  await expect(taskTabs.getByRole("tab")).toHaveCount(2);
  await expect(taskTabs.getByRole("tab", { name: "Bindings", exact: true })).toBeVisible();
  await expect(taskTabs.getByRole("tab", { name: "Conflicts", exact: true })).toBeVisible();
  await expect(taskTabs.getByRole("tab", { name: "Try shortcuts", exact: true })).toHaveCount(0);

  const firstBox = await taskTabs.getByRole("tab").nth(0).boundingBox();
  const lastBox = await taskTabs.getByRole("tab").nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(Math.abs((firstBox?.y ?? 0) - (lastBox?.y ?? 0))).toBeLessThan(3);

  const presentation = page.getByLabel("Shortcut presentation");
  await expect(presentation.getByRole("button", { name: "List" })).toBeVisible();
  await expect(presentation.getByRole("button", { name: "Mobile controls" })).toBeVisible();
  await expect(presentation.getByRole("button", { name: "Keyboard" })).toHaveCount(0);
  await expect(page.getByText("Hotkeys ?", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Shortcuts ?", { exact: true })).toBeHidden();

  await expect(page.getByLabel("Category")).toBeHidden();
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await filters.click();
  await expect(page.getByLabel("Category")).toBeVisible();
  await filters.click();
  await expect(page.getByLabel("Category")).toBeHidden();

  await page.getByRole("searchbox", { name: "Search actions or shortcuts" }).fill("Save document");
  const saveRow = page.getByRole("row").filter({ hasText: "Save document" });
  await expect(saveRow).toBeVisible();

  await saveRow.getByRole("button", { name: "Edit", exact: true }).click();
  const manual = page.getByLabel("Manual shortcut entry");
  await expect(manual).toBeVisible();
  await manual.getByLabel("Manual key or code").fill("k");
  await page.screenshot({
    path: "test-results/pages/mobile-input-settings-editor.png",
    fullPage: true,
  });
  await manual.getByRole("button", { name: "Set shortcut" }).click();

  const recorder = page.locator(".ib-recorder");
  await recorder.getByRole("button", { name: "Save", exact: true }).click();

  await expect(saveRow.getByText("Changed", { exact: true })).toBeVisible();

  await presentation.getByRole("button", { name: "Mobile controls" }).click();
  await expect(page.getByRole("heading", { name: "Mobile controls" })).toBeVisible();
  await page.getByRole("button", { name: "A mobile control" }).click();

  const inspector = page.getByLabel("Selected mobile control");
  await expect(inspector.getByLabel("Semantic action")).toHaveValue("game.jump");
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("74");
  await expect(inspector.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("74");

  await page.getByRole("button", { name: "Move mobile control" }).click();
  await expect(page.getByLabel("Selected mobile control").getByLabel("Analog action")).toHaveValue("game.move");

  await page.getByRole("button", { name: "Test", exact: true }).click();
  await expect(page.getByLabel("Mobile controls runtime")).toBeVisible();

  const stick = page.getByRole("button", { name: "Move runtime control" });
  const stickBox = await stick.boundingBox();
  expect(stickBox).not.toBeNull();
  if (stickBox) {
    await page.mouse.move(stickBox.x + stickBox.width / 2, stickBox.y + stickBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(stickBox.x + stickBox.width - 2, stickBox.y + stickBox.height / 2);
    await expect(page.getByLabel("Move axis")).not.toHaveText("0.00, 0.00");
    const moveText = (await page.getByLabel("Move axis").textContent()) ?? "0, 0";
    expect(Number.parseFloat(moveText.split(",")[0] ?? "0")).toBeGreaterThan(0.5);
    await page.mouse.up();
    await expect(page.getByLabel("Move axis")).toHaveText("0.00, 0.00");
  }

  await page.getByRole("button", { name: "A runtime control" }).click();
  await expect(page.getByLabel("Last mobile action")).toHaveText("game.jump · release");
  await expect(page.getByRole("button", { name: "Enable gyroscope look" })).toBeVisible();

  await page.screenshot({
    path: "test-results/pages/mobile-controls-runtime.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Edit", exact: true }).click();

  await page.screenshot({
    path: "test-results/pages/mobile-controls-overlay.png",
    fullPage: true,
  });

  await page.reload();
  await page.getByRole("searchbox", { name: "Search actions or shortcuts" }).fill("Save document");
  const persistedSaveRow = page.getByRole("row").filter({ hasText: "Save document" });
  await expect(persistedSaveRow.getByText("Changed", { exact: true })).toBeVisible();

  await page.getByLabel("Shortcut presentation").getByRole("button", { name: "Mobile controls" }).click();
  await page.getByRole("button", { name: "A mobile control" }).click();
  await expect(page.getByLabel("Selected mobile control").getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("74");

  const metrics = await page.locator("html").evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  await page.screenshot({
    path: "test-results/pages/mobile-input-settings.png",
    fullPage: true,
  });
});


test("saved v1 mobile overlays migrate their stick and look mappings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "input-bindings-demo-mobile-overlay-v1",
      JSON.stringify({
        orientation: "landscape",
        controls: [
          {
            id: "movement-stick",
            kind: "stick",
            label: "Move",
            actionId: "game.moveForward",
            x: 5,
            y: 47,
            width: 24,
            height: 42,
          },
          {
            id: "camera-zone",
            kind: "gestureZone",
            label: "Look",
            x: 41,
            y: 18,
            width: 36,
            height: 43,
          },
        ],
      }),
    );
  });

  await page.goto("./");
  await page.getByLabel("Shortcut presentation").getByRole("button", { name: "Mobile controls" }).click();

  await page.getByRole("button", { name: "Move mobile control" }).click();
  await expect(page.getByLabel("Selected mobile control").getByLabel("Analog action")).toHaveValue("game.move");

  await page.getByRole("button", { name: "Look mobile control" }).click();
  await expect(page.getByLabel("Selected mobile control").getByLabel("Analog action")).toHaveValue("game.look");
});
