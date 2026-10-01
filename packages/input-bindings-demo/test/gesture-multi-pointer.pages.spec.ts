import { expect, test, type Page } from "@playwright/test";

type Point = { x: number; y: number };
type Pair = readonly [Point, Point];

async function surfaceOrigin(page: Page): Promise<Point> {
  const surface = page.getByRole("application", { name: "Gesture capture surface" });
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  return { x: box?.x ?? 0, y: box?.y ?? 0 };
}

/** Moves two touch points from `from` to `to` (surface-local) and optionally cancels instead. */
async function twoFinger(page: Page, from: Pair, to: Pair, end: "lift" | "cancel" = "lift") {
  const origin = await surfaceOrigin(page);
  const session = await page.context().newCDPSession(page);
  const at = (pair: Pair) =>
    pair.map((point, index) => ({ x: origin.x + point.x, y: origin.y + point.y, id: index + 1 }));
  const [a, b] = at(from);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a!] });
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a!, b!] });
  for (let step = 1; step <= 8; step += 1) {
    const ratio = step / 8;
    const pair = [0, 1].map((index) => ({
      x: from[index]!.x + (to[index]!.x - from[index]!.x) * ratio,
      y: from[index]!.y + (to[index]!.y - from[index]!.y) * ratio,
    })) as unknown as Pair;
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(pair) });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: end === "lift" ? "touchEnd" : "touchCancel",
    touchPoints: [],
  });
  await session.detach();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./gestures.html");
});

test("pinches resolve to zoom actions through the shared runtime", async ({ page }) => {
  await twoFinger(
    page,
    [
      { x: 150, y: 150 },
      { x: 210, y: 150 },
    ],
    [
      { x: 90, y: 150 },
      { x: 270, y: 150 },
    ],
  );
  await expect(page.getByLabel("Two-finger status")).toHaveText("completed");
  await expect(page.getByLabel("Two-finger modes")).toContainText("pinch");
  await expect(page.getByLabel("Two-finger action")).toHaveText("view.zoomIn");

  await twoFinger(
    page,
    [
      { x: 90, y: 150 },
      { x: 270, y: 150 },
    ],
    [
      { x: 160, y: 150 },
      { x: 200, y: 150 },
    ],
  );
  await expect(page.getByLabel("Two-finger action")).toHaveText("view.zoomOut");
  await expect(page.getByLabel("Decision outcome")).toHaveCount(0);
});

test("rotation and two-finger swipes resolve to their own actions", async ({ page }) => {
  await twoFinger(
    page,
    [
      { x: 100, y: 180 },
      { x: 260, y: 180 },
    ],
    [
      { x: 180, y: 100 },
      { x: 180, y: 260 },
    ],
  );
  await expect(page.getByLabel("Two-finger modes")).toContainText("rotate");
  await expect(page.getByLabel("Two-finger action")).toHaveText("view.rotate");

  await twoFinger(
    page,
    [
      { x: 120, y: 260 },
      { x: 200, y: 260 },
    ],
    [
      { x: 120, y: 120 },
      { x: 200, y: 120 },
    ],
  );
  await expect(page.getByLabel("Two-finger modes")).toHaveText("pan");
  await expect(page.getByLabel("Two-finger action")).toHaveText("view.pan");
});

test("a cancelled two-finger session never dispatches", async ({ page }) => {
  await twoFinger(
    page,
    [
      { x: 150, y: 150 },
      { x: 210, y: 150 },
    ],
    [
      { x: 90, y: 150 },
      { x: 270, y: 150 },
    ],
    "cancel",
  );
  await expect(page.getByLabel("Two-finger status")).toHaveText("cancelled");
  await expect(page.getByLabel("Two-finger action")).toHaveText("—");
});
