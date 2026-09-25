import { expect, test } from "@playwright/test";

test("mobile Pages settings stay compact, editable, and persistent", async ({ page }) => {
  await page.goto("./");

  await expect(page.getByRole("heading", { name: "Keyboard & controls" })).toBeVisible();

  const taskTabs = page.getByRole("tablist", { name: "Input settings tasks" });
  await expect(taskTabs.getByRole("tab")).toHaveCount(3);

  const firstBox = await taskTabs.getByRole("tab").nth(0).boundingBox();
  const lastBox = await taskTabs.getByRole("tab").nth(2).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(Math.abs((firstBox?.y ?? 0) - (lastBox?.y ?? 0))).toBeLessThan(3);

  await page.getByRole("searchbox", { name: "Search actions or shortcuts" }).fill("Save document");
  const saveRow = page.getByRole("row").filter({ hasText: "Save document" });
  await expect(saveRow).toBeVisible();

  await saveRow.getByRole("button", { name: "Edit", exact: true }).click();
  const manual = page.getByLabel("Manual shortcut entry");
  await expect(manual).toBeVisible();
  await manual.getByLabel("Manual key or code").fill("k");
  await manual.getByRole("button", { name: "Set shortcut" }).click();

  const recorder = page.locator(".ib-recorder");
  await recorder.getByRole("button", { name: "Save", exact: true }).click();

  await expect(saveRow.getByText("Changed", { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("searchbox", { name: "Search actions or shortcuts" }).fill("Save document");
  const persistedSaveRow = page.getByRole("row").filter({ hasText: "Save document" });
  await expect(persistedSaveRow.getByText("Changed", { exact: true })).toBeVisible();

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
