import { expect, test } from "@playwright/test";

import type { Page } from "@playwright/test";

const storyBase = "input-bindings-workbench";

test("shortcut task exposes list and keyboard as presentations, not peer tasks", async ({ page }) => {
  await openStory(page, "list");

  const taskTabs = page.getByRole("tablist", { name: "Input settings tasks" });
  await expect(taskTabs.getByRole("tab")).toHaveCount(3);
  await expect(taskTabs.getByRole("tab", { name: "Shortcuts", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(taskTabs.getByRole("tab", { name: "Conflicts", exact: true })).toHaveAttribute("aria-selected", "false");
  await expect(taskTabs.getByRole("tab", { name: "Try shortcuts", exact: true })).toHaveAttribute("aria-selected", "false");

  const panel = page.getByRole("tabpanel");
  await expect(panel).toHaveAttribute("id", "ib-workbench-panel-shortcuts");
  await expect(panel).toHaveAttribute("aria-labelledby", "ib-workbench-tab-shortcuts");

  const presentation = page.getByLabel("Shortcut presentation");
  await expect(presentation.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await expect(presentation.getByRole("button", { name: "Keyboard" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("table", { name: "Keybindings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keyboard overview" })).toHaveCount(0);
});

test("keyboard presentation keeps ordinary shortcut editing available", async ({ page }) => {
  await openStory(page, "list");

  await page.getByLabel("Shortcut presentation").getByRole("button", { name: "Keyboard" }).click();
  await expect(page.getByRole("table", { name: "Keybindings" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Keyboard overview" })).toBeVisible();

  const escape = page.locator('button[data-key-code="Escape"]');
  await expect(escape).toHaveAccessibleName(/2 bindings, conflict/);
  await escape.click();

  await expect(page.getByText("Pause game", { exact: true })).toBeVisible();
  const actions = page.getByLabel("Selected shortcut actions");
  await expect(actions.getByRole("button", { name: "Edit binding" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Disable binding" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Add binding" })).toBeVisible();

  await actions.getByRole("button", { name: "Edit binding" }).click();
  await expect(page.getByRole("heading", { name: "Edit binding for Pause game" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("task tabs implement automatic keyboard activation and roving focus", async ({ page }) => {
  await openStory(page, "list");

  const shortcuts = page.getByRole("tab", { name: "Shortcuts", exact: true });
  await shortcuts.focus();
  await page.keyboard.press("ArrowRight");

  const conflicts = page.getByRole("tab", { name: "Conflicts", exact: true });
  await expect(conflicts).toBeFocused();
  await expect(conflicts).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("id", "ib-workbench-panel-conflicts");
  await expect(page.getByRole("heading", { name: "Conflict review" })).toBeVisible();

  await page.keyboard.press("End");
  const preview = page.getByRole("tab", { name: "Try shortcuts", exact: true });
  await expect(preview).toBeFocused();
  await expect(preview).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAttribute("id", "ib-workbench-panel-preview");

  await page.keyboard.press("Home");
  await expect(shortcuts).toBeFocused();
  await expect(shortcuts).toHaveAttribute("aria-selected", "true");
});

test("conflict repair is a separate keyboard-operable workflow", async ({ page }) => {
  await openStory(page, "conflicts");

  await expect(page.getByRole("heading", { name: "Conflict review" })).toBeVisible();
  await expect(page.getByText("ordered by context stack", { exact: true })).toBeVisible();
  await expect(page.getByText("still ambiguous", { exact: true })).toBeVisible();

  const preferPause = page.getByRole("button", { name: /Prefer Pause game/ });
  await preferPause.focus();
  await expect(preferPause).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByTestId("profile-state")).toHaveText("Profile patches: 1");
  await expect(page.getByText("Ordered override", { exact: true })).toBeVisible();
});

test("live preview is explicitly activated and announces the resolution", async ({ page }) => {
  await openStory(page, "preview");

  await expect(page.getByLabel("Preview context")).toBeVisible();
  await expect(page.getByLabel("Application context")).toHaveValue("global");
  await expect(page.getByLabel("Interactive keyboard shortcut preview")).toBeVisible();

  await page.getByRole("button", { name: "Start preview" }).click();
  const previewSurface = page.getByLabel("Interactive keyboard shortcut preview");
  await expect(previewSurface).toBeFocused();

  await page.keyboard.press("Control+Shift+P");
  await expect(page.locator(".ib-resolution > strong")).toHaveText("Command palette");
  await expect(page.getByText(/resolves to global\.commandPalette/)).toBeVisible();

  await page.getByRole("button", { name: "Stop preview" }).click();
  await expect(page.getByRole("button", { name: "Start preview" })).toBeVisible();
});

test("narrow screens replace keyboard-only surfaces with mobile controls", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 });
  await openStory(page, "keyboard");

  const taskTabs = page.getByRole("tablist", { name: "Input settings tasks" });
  await expect(taskTabs.getByRole("tab")).toHaveCount(2);
  await expect(taskTabs.getByRole("tab", { name: "Bindings", exact: true })).toBeVisible();
  await expect(taskTabs.getByRole("tab", { name: "Conflicts", exact: true })).toBeVisible();
  await expect(taskTabs.getByRole("tab", { name: "Try shortcuts", exact: true })).toHaveCount(0);

  const presentation = page.getByLabel("Shortcut presentation");
  await expect(presentation.getByRole("button", { name: "List" })).toBeVisible();
  await expect(presentation.getByRole("button", { name: "Mobile controls" })).toHaveAttribute("aria-pressed", "true");
  await expect(presentation.getByRole("button", { name: "Keyboard" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mobile controls" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keyboard overview" })).toHaveCount(0);

  const metrics = await page.locator("html").evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
});

test("mobile settings support exact binding edits and an editable touch overlay", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, "mobile-settings");

  const taskTabs = page.getByRole("tablist", { name: "Input settings tasks" });
  const tabs = taskTabs.getByRole("tab");
  await expect(tabs).toHaveCount(2);
  const firstBox = await tabs.nth(0).boundingBox();
  const lastBox = await tabs.nth(1).boundingBox();
  expect(firstBox).not.toBeNull();
  expect(lastBox).not.toBeNull();
  expect(Math.abs((firstBox?.y ?? 0) - (lastBox?.y ?? 0))).toBeLessThan(3);
  await expect(taskTabs.getByRole("tab", { name: "Bindings", exact: true })).toBeVisible();
  await expect(taskTabs.getByRole("tab", { name: "Try shortcuts", exact: true })).toHaveCount(0);

  const presentation = page.getByLabel("Shortcut presentation");
  await expect(presentation.getByRole("button", { name: "Mobile controls" })).toBeVisible();
  await expect(presentation.getByRole("button", { name: "Keyboard" })).toHaveCount(0);

  await expect(page.getByLabel("Category")).toBeHidden();
  const filters = page.getByRole("button", { name: "Filters", exact: true });
  await filters.click();
  await expect(page.getByLabel("Category")).toBeVisible();
  await filters.click();
  await expect(page.getByLabel("Category")).toBeHidden();

  await page.getByRole("searchbox", { name: "Search actions or shortcuts" }).fill("Save");
  const saveRow = page.getByRole("row").filter({ hasText: "Save document" });
  await expect(saveRow).toBeVisible();
  await expect(saveRow.getByText("Save the active editor document.")).toBeHidden();

  await saveRow.getByRole("button", { name: "Edit", exact: true }).click();
  const manual = page.getByLabel("Manual shortcut entry");
  await expect(manual).toBeVisible();
  const manualKey = manual.getByLabel("Manual key or code");
  const setShortcut = manual.getByRole("button", { name: "Set shortcut" });

  await manualKey.fill("Control");
  await expect(setShortcut).toBeDisabled();

  await manualKey.fill("Esc");
  await expect(setShortcut).toBeEnabled();
  await setShortcut.click();
  await expect(page.locator(".ib-capture strong")).toHaveText("Escape");

  await manualKey.fill("k");
  await page.screenshot({
    path: "test-results/storybook/workbench-mobile-editor.png",
    fullPage: true,
  });
  await setShortcut.click();

  const recorder = page.locator(".ib-recorder");
  await expect(recorder.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await recorder.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("profile-state")).toHaveText("Profile patches: 1");

  await presentation.getByRole("button", { name: "Mobile controls" }).click();
  await expect(page.getByRole("heading", { name: "Mobile controls" })).toBeVisible();
  await expect(page.getByLabel("Mobile control overlay preview")).toBeVisible();

  await page.getByRole("button", { name: "A mobile control" }).click();
  const inspector = page.getByLabel("Selected mobile control");
  await expect(inspector.getByLabel("Semantic action")).toHaveValue("game.jump");
  await inspector.getByRole("spinbutton", { name: "X", exact: true }).fill("76");
  await expect(inspector.getByRole("spinbutton", { name: "X", exact: true })).toHaveValue("76");

  await page.getByRole("button", { name: "Add action button" }).click();
  await expect(page.getByTestId("mobile-overlay-state")).toHaveText("Mobile controls: 6");

  const metrics = await page.locator("html").evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  await page.screenshot({
    path: "test-results/storybook/workbench-mobile-overlay.png",
    fullPage: true,
  });
});

test("keyboard presentation produces inspectable visual evidence", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openStory(page, "keyboard");

  await page.locator('button[data-key-code="Escape"]').click();
  await expect(page.getByLabel("Selected shortcut actions")).toBeVisible();

  await page.screenshot({
    path: "test-results/storybook/workbench-keyboard.png",
    fullPage: true,
  });
});

test("all workbench stories render without browser errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));

  for (const story of ["list", "keyboard", "conflicts", "preview", "mobile-settings"] as const) {
    await openStory(page, story);
  }

  expect(errors).toEqual([]);
});

async function openStory(page: Page, story: "list" | "keyboard" | "conflicts" | "preview" | "mobile-settings") {
  await page.goto(`/iframe.html?id=${storyBase}--${story}&viewMode=story`);
  await expect(page.locator("#storybook-root")).toBeVisible();
  await expect(page.locator(".ib-workbench")).toBeVisible();
}
