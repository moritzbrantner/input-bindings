import { expect, test, type Page } from "@playwright/test";

async function surfaceBox(page: Page) {
  const box = await page
    .getByRole("application", { name: "Gesture capture surface" })
    .boundingBox();
  expect(box).not.toBeNull();
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
}

async function touchDrag(page: Page, points: readonly { x: number; y: number }[]) {
  const session = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  if (!first) {
    return;
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: first.x, y: first.y, id: 1 }],
  });
  for (const point of rest) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: point.x, y: point.y, id: 1 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

test("mouse and touch strokes enter one Pointer Events capture path", async ({ page }) => {
  await page.goto("./gestures.html");
  await expect(page.getByRole("application", { name: "Gesture capture surface" })).toBeVisible();
  const box = await surfaceBox(page);

  await page.mouse.move(box.x + 20, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 30, { steps: 4 });
  await page.mouse.move(box.x + 140, box.y + 60, { steps: 4 });
  await page.mouse.up();

  await expect(page.getByLabel("Stroke status")).toHaveText("completed");
  await expect(page.getByLabel("Pointer type")).toHaveText("mouse");
  await expect(page.getByLabel("Stroke start")).toHaveText("20, 30");
  await expect(page.getByLabel("Stroke end")).toHaveText("140, 60");
  const mouseSamples = Number(await page.getByLabel("Sample count").textContent());
  expect(mouseSamples).toBeGreaterThanOrEqual(3);

  await touchDrag(page, [
    { x: box.x + 20, y: box.y + 30 },
    { x: box.x + 80, y: box.y + 30 },
    { x: box.x + 140, y: box.y + 60 },
  ]);

  await expect(page.getByLabel("Pointer type")).toHaveText("touch");
  await expect(page.getByLabel("Stroke status")).toHaveText("completed");
  await expect(page.getByLabel("Stroke start")).toHaveText("20, 30");
  await expect(page.getByLabel("Stroke end")).toHaveText("140, 60");

  const lifecycle = page.getByRole("list", { name: "Lifecycle" });
  await expect(lifecycle.getByRole("listitem").first()).toContainText("complete");
  await expect(lifecycle.getByRole("listitem").first()).toContainText("touch");
});

test("a blur during an active stroke cancels it instead of stranding capture", async ({ page }) => {
  await page.goto("./gestures.html");
  const box = await surfaceBox(page);

  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 40, { steps: 3 });
  await expect(page.getByLabel("Stroke status")).toHaveText("active");

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.getByLabel("Stroke status")).toHaveText("cancelled");
  await expect(
    page.getByRole("list", { name: "Lifecycle" }).getByRole("listitem").first(),
  ).toContainText("blur");

  await page.mouse.move(box.x + 120, box.y + 60, { steps: 2 });
  await page.mouse.up();
  await expect(page.getByLabel("Stroke status")).toHaveText("cancelled");
});
