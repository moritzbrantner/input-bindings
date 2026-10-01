import { expect, test, type Page } from "@playwright/test";

const storyUrl = "/iframe.html?id=input-bindings-mobile-runtime--mapping-changes&viewMode=story";

test("same-ID action remapping releases the mapping that was pressed", async ({ page }) => {
  await openStory(page);
  await holdRuntimeControl(page);

  await clickProgrammatically(page, "Change action mapping");
  const events = page.getByTestId("runtime-events");
  await expect(events).toHaveText("action:game.jump:press | action:game.jump:release");

  await page.mouse.up();
  await expect(events).toHaveText("action:game.jump:press | action:game.jump:release");
});

test("same-ID analog remapping releases the original analog source", async ({ page }) => {
  await openStory(page);
  await page.getByRole("button", { name: "Use analog mapping" }).click();
  await holdRuntimeControl(page);

  await clickProgrammatically(page, "Change analog mapping");
  const events = page.getByTestId("runtime-events");
  await expect(events).toHaveText("analog:game.move:update | analog:game.move:release");

  await page.mouse.up();
  await expect(events).toHaveText("analog:game.move:update | analog:game.move:release");
});

test("changing an active control kind cancels the previous mapping", async ({ page }) => {
  await openStory(page);
  await holdRuntimeControl(page);

  await clickProgrammatically(page, "Use analog mapping");
  const events = page.getByTestId("runtime-events");
  await expect(events).toHaveText("action:game.jump:press | action:game.jump:release");

  await page.mouse.up();
  await expect(events).toHaveText("action:game.jump:press | action:game.jump:release");
});

async function openStory(page: Page) {
  await page.goto(storyUrl);
  await expect(page.getByLabel("Mobile controls runtime")).toBeVisible();
}

async function holdRuntimeControl(page: Page) {
  const control = page.getByRole("button", {
    name: "Changing runtime control",
  });
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    return;
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}

async function clickProgrammatically(page: Page, name: string) {
  await page.getByRole("button", { name }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}
