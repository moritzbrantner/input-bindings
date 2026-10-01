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

test("a captured slash shows recognition evidence and the semantic decision", async ({ page }) => {
  await page.goto("./gestures.html");
  const box = await surfaceBox(page);

  await page.mouse.move(box.x + 20, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 200, { steps: 3 });
  await page.mouse.up();

  await expect(page.getByLabel("Decision outcome")).toHaveText("dispatched");
  await expect(page.getByLabel("Dispatched action")).toHaveText("combat.slash");
  await expect(page.getByLabel("Matched gesture")).toHaveText("Slash");
  const candidates = page.getByRole("list", { name: "Candidates" });
  await expect(candidates.getByRole("listitem").first()).toContainText("slash");
  await expect(page.getByRole("img", { name: "Normalized path" })).toBeVisible();
});

test("recording is explicit and exported traces replay to the same decision at any size", async ({
  page,
}) => {
  await page.goto("./gestures.html");
  const exportButton = page.getByRole("button", { name: "Export last trace" });
  const drawLoop = async () => {
    // Controls below the surface scroll the mobile page; measure the surface fresh each time.
    await page
      .getByRole("application", { name: "Gesture capture surface" })
      .scrollIntoViewIfNeeded();
    const box = await surfaceBox(page);
    const center = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 160) };
    await touchDrag(
      page,
      Array.from({ length: 25 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        return { x: center.x + 80 * Math.cos(angle), y: center.y + 80 * Math.sin(angle) };
      }),
    );
  };

  await drawLoop();
  await expect(page.getByLabel("Dispatched action")).toHaveText("selection.encircle");
  await expect(exportButton).toBeDisabled();
  await expect(page.getByLabel("Recorded traces")).toHaveText("0 recorded");

  await page.getByRole("button", { name: "Record" }).click();
  await drawLoop();
  await expect(page.getByLabel("Recorded traces")).toHaveText("1 recorded");
  await exportButton.click();

  const exported = await page.getByLabel("Exported trace").inputValue();
  const trace = JSON.parse(exported) as {
    format: string;
    pointerType: string;
    expected: { primitives: string[]; matches: Array<{ kind: string; orientation?: string }> };
  };
  expect(trace.format).toBe("input-bindings/gesture-trace");
  expect(trace.pointerType).toBe("touch");
  expect(trace.expected.primitives[0]).toBe("circle");
  expect(trace.expected.matches[0]).toEqual({ kind: "circle", orientation: "clockwise" });

  for (const scale of ["0.5", "2"]) {
    await page.getByLabel("Replay trace JSON").fill(exported);
    await page.getByLabel("Replay scale").selectOption(scale);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await expect(page.getByLabel("Source")).toHaveText(`replay ${scale}×`);
    await expect(page.getByLabel("Dispatched action")).toHaveText("selection.encircle");
    await expect(page.getByLabel("Matched gesture")).toHaveText("Circle");
  }

  await page.getByLabel("Replay trace JSON").fill("{}");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unsupported gesture trace");
});
