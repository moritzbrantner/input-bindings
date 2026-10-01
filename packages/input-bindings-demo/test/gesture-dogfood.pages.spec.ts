import { expect, test, type Page } from "@playwright/test";

type Point = { x: number; y: number };
type Pointer = "mouse" | "touch";

const surfaceName = { name: "Gesture capture surface" } as const;

/** Draws surface-local points, measuring the surface fresh because controls scroll the page. */
async function draw(page: Page, pointer: Pointer, local: readonly Point[]) {
  const surface = page.getByRole("application", surfaceName);
  await surface.scrollIntoViewIfNeeded();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const points = local.map((point) => ({ x: (box?.x ?? 0) + point.x, y: (box?.y ?? 0) + point.y }));
  const [first, ...rest] = points;
  if (!first) {
    return;
  }
  if (pointer === "mouse") {
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const point of rest) {
      await page.mouse.move(point.x, point.y);
    }
    await page.mouse.up();
    return;
  }
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...first, id: 1 }],
  });
  for (const point of rest) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ ...point, id: 1 }],
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

function polyline(points: readonly Point[], stepsPerSegment = 6): Point[] {
  return points.flatMap((point, index) => {
    const next = points[index + 1];
    if (!next) {
      return [point];
    }
    return Array.from({ length: stepsPerSegment }, (_, step) => ({
      x: point.x + ((next.x - point.x) * step) / stepsPerSegment,
      y: point.y + ((next.y - point.y) * step) / stepsPerSegment,
    }));
  });
}

const risingSlash = polyline([
  { x: 40, y: 300 },
  { x: 260, y: 80 },
]);
const fallingLeftSlash = polyline([
  { x: 300, y: 300 },
  { x: 80, y: 80 },
]);
const lightning = polyline(
  [
    { x: 60, y: 0 },
    { x: 30, y: 50 },
    { x: 70, y: 50 },
    { x: 40, y: 100 },
  ].map((point) => ({ x: 80 + point.x * 2.5, y: 40 + point.y * 2.5 })),
);

async function setCheckbox(page: Page, name: string, checked: boolean) {
  await page.getByRole("checkbox", { name }).setChecked(checked);
}

async function expectAction(page: Page, action: string) {
  await expect(page.getByLabel("Dispatched action")).toHaveText(action);
}

test.beforeEach(async ({ page }) => {
  await page.goto("./gestures.html");
  await expect(page.getByRole("application", surfaceName)).toBeVisible();
});

test("equivalent mouse and touch slashes trigger the same semantic action", async ({ page }) => {
  for (const pointer of ["mouse", "touch"] as const) {
    await draw(page, pointer, risingSlash);
    await expectAction(page, "combat.risingSlash");
    await expect(page.getByLabel("Matched gesture")).toHaveText("Slash NE");
    await expect(page.getByLabel("Pointer type")).toHaveText(pointer);
    await expect(page.getByLabel("Consumer effect")).toContainText("slash hit");
  }
});

test("context stacks enable and block gesture bindings normally", async ({ page }) => {
  await draw(page, "touch", lightning);
  await expect(page.getByLabel("Decision outcome")).toHaveText("none");

  await setCheckbox(page, "Spellcasting", true);
  await draw(page, "touch", lightning);
  await expectAction(page, "spell.fire");
  await expect(page.getByLabel("Matched gesture")).toHaveText("Symbol lightning");
  await expect(page.getByLabel("Consumer effect")).toHaveText("fire bolt cast");

  await setCheckbox(page, "Menu open (modal)", true);
  await draw(page, "mouse", risingSlash);
  await expect(page.getByLabel("Decision outcome")).toHaveText("none");
  await draw(page, "touch", [{ x: 150, y: 150 }]);
  await expectAction(page, "menu.select");
});

test("profiles rebind and disable gestures without changing recognition", async ({ page }) => {
  await page.getByLabel("Profile").selectOption("left-handed");
  await draw(page, "mouse", risingSlash);
  await expectAction(page, "combat.slash");
  await draw(page, "mouse", fallingLeftSlash);
  await expectAction(page, "combat.risingSlash");
  await expect(page.getByLabel("Matched gesture")).toHaveText("Slash NW");

  await page.getByLabel("Profile").selectOption("no-runes");
  await setCheckbox(page, "Spellcasting", true);
  await draw(page, "touch", lightning);
  await expect(page.getByLabel("Decision outcome")).toHaveText("none");
  const symbols = page.getByRole("list", { name: "Symbols" });
  await expect(symbols.getByRole("listitem").first()).toContainText("lightning");
  await expect(symbols.getByRole("listitem").first()).toContainText("accepted");
});

test("encircling selects targets through consumer-owned enclosure logic", async ({ page }) => {
  const surface = await page.getByRole("application", surfaceName).boundingBox();
  const width = surface?.width ?? 300;
  const height = surface?.height ?? 300;
  // Target C sits at 40% / 65% of the surface.
  const center = { x: width * 0.4, y: height * 0.65 };
  await draw(
    page,
    "touch",
    Array.from({ length: 25 }, (_, index) => {
      const angle = (index / 24) * Math.PI * 2;
      return { x: center.x + 50 * Math.cos(angle), y: center.y + 50 * Math.sin(angle) };
    }),
  );
  await expectAction(page, "selection.encircle");
  await expect(page.getByLabel("Consumer effect")).toHaveText("selected C");
});

test("speed changes the recognized parameters of the same slash", async ({ page }) => {
  const trace = (samples: Array<[number, number, number]>) =>
    JSON.stringify({
      format: "input-bindings/gesture-trace",
      version: 1,
      id: "speed",
      pointerType: "mouse",
      surface: { width: 400, height: 400 },
      samples: samples.map(([x, y, t]) => ({ x, y, t })),
    });
  const replay = async (json: string) => {
    await page.getByLabel("Replay trace JSON").fill(json);
    await page.getByRole("button", { name: "Replay", exact: true }).click();
  };

  await replay(
    trace([
      [40, 360, 0],
      [140, 260, 40],
      [240, 160, 80],
      [340, 60, 120],
    ]),
  );
  await expectAction(page, "combat.risingSlash");
  await expect(page.getByLabel("Consumer effect")).toContainText("fast slash");

  await replay(
    trace([
      [40, 360, 0],
      [140, 260, 60],
      [240, 160, 120],
      [340, 60, 600],
    ]),
  );
  await expectAction(page, "combat.risingSlash");
  await expect(page.getByLabel("Consumer effect")).toContainText("medium slash");
});

test("a recorded rune replays to the same decision", async ({ page }) => {
  await setCheckbox(page, "Spellcasting", true);
  await page.getByRole("button", { name: "Record" }).click();
  await draw(page, "mouse", lightning);
  await expectAction(page, "spell.fire");
  await page.getByRole("button", { name: "Export last trace" }).click();
  const exported = await page.getByLabel("Exported trace").inputValue();
  expect(JSON.parse(exported).expected.matches[0]).toEqual({ kind: "symbol", id: "lightning" });

  await draw(page, "mouse", risingSlash);
  await expectAction(page, "combat.risingSlash");

  await page.getByLabel("Replay trace JSON").fill(exported);
  await page.getByLabel("Replay scale").selectOption("2");
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect(page.getByLabel("Source")).toHaveText("replay 2×");
  await expectAction(page, "spell.fire");
});
