import { expect, test, type CDPSession, type Page } from "@playwright/test";

const storyUrl =
  "/iframe.html?id=input-bindings-mobile-gesture-zones--shared-gesture-runtime&viewMode=story";

test.use({ hasTouch: true });

type Point = { x: number; y: number };

async function openStory(page: Page) {
  await page.goto(storyUrl);
  await expect(page.getByRole("button", { name: "Spells runtime control" })).toBeVisible();
}

async function center(page: Page, name: string, role: "button" | "application" = "button") {
  const box = await page.getByRole(role, { name }).boundingBox();
  expect(box).not.toBeNull();
  return { x: (box?.x ?? 0) + (box?.width ?? 0) / 2, y: (box?.y ?? 0) + (box?.height ?? 0) / 2 };
}

function loop(origin: Point, radius: number): Point[] {
  return Array.from({ length: 25 }, (_, index) => {
    const angle = (index / 24) * Math.PI * 2;
    return { x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) };
  });
}

function slash(origin: Point, length: number): Point[] {
  return Array.from({ length: 6 }, (_, index) => ({
    x: origin.x - length / 2 + (length * index) / 5,
    y: origin.y,
  }));
}

class Touch {
  private constructor(private readonly session: CDPSession) {}

  static async open(page: Page) {
    return new Touch(await page.context().newCDPSession(page));
  }

  async start(point: Point) {
    await this.session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...point, id: 1 }],
    });
  }

  async move(points: readonly Point[]) {
    for (const point of points) {
      await this.session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...point, id: 1 }],
      });
    }
  }

  async end() {
    await this.session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }

  async cancel() {
    await this.session.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  }

  async draw(points: readonly Point[]) {
    const [first, ...rest] = points;
    if (first) {
      await this.start(first);
      await this.move(rest);
      await this.end();
    }
  }
}

async function clickProgrammatically(page: Page, name: string) {
  await page.getByRole("button", { name }).evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}

test("the same gestures resolve on an unrestricted surface and inside a gesture zone", async ({
  page,
}) => {
  await openStory(page);
  const events = page.getByTestId("gesture-events");
  const touch = await Touch.open(page);

  const desktop = await center(page, "Desktop gesture surface", "application");
  await page.mouse.move(desktop.x - 120, desktop.y);
  await page.mouse.down();
  await page.mouse.move(desktop.x + 120, desktop.y, { steps: 4 });
  await page.mouse.up();
  await expect(events).toHaveText("desktop:game.attack");

  const zone = await center(page, "Spells runtime control");
  await touch.draw(slash(zone, 200));
  await expect(events).toHaveText("desktop:game.attack | zone:game.attack");

  await page.mouse.move(desktop.x + 60, desktop.y);
  await page.mouse.down();
  for (const point of loop(desktop, 60).slice(1)) {
    await page.mouse.move(point.x, point.y);
  }
  await page.mouse.up();
  await touch.draw(loop(zone, 80));
  await expect(events).toHaveText(
    "desktop:game.attack | zone:game.attack | desktop:selection.lasso | zone:spell.ward",
  );
});

test("a stroke that leaves its zone keeps its captured identity and still resolves", async ({
  page,
}) => {
  await openStory(page);
  const touch = await Touch.open(page);
  const zone = await center(page, "Spells runtime control");
  const jump = await center(page, "Jump runtime control");

  await touch.start({ x: zone.x, y: zone.y });
  await touch.move(slash({ x: (zone.x + jump.x) / 2, y: zone.y }, zone.x - jump.x).reverse());
  await touch.end();
  await expect(page.getByTestId("gesture-events")).toHaveText("zone:game.attack");
});

test("layout and unrelated overlay edits during a stroke do not interrupt it", async ({ page }) => {
  await openStory(page);
  const touch = await Touch.open(page);
  const zone = await center(page, "Spells runtime control");
  const points = slash(zone, 200);

  await touch.start(points[0] ?? zone);
  await touch.move(points.slice(1, 3));
  await clickProgrammatically(page, "Move jump button");
  await clickProgrammatically(page, "Rotate overlay");
  await touch.move(points.slice(3));
  await touch.end();
  await expect(page.getByTestId("gesture-events")).toHaveText("zone:game.attack");
});

test("cancellation and zone remapping during a stroke never dispatch", async ({ page }) => {
  await openStory(page);
  const touch = await Touch.open(page);
  const events = page.getByTestId("gesture-events");
  const zone = await center(page, "Spells runtime control");
  const points = slash(zone, 200);

  await touch.start(points[0] ?? zone);
  await touch.move(points.slice(1, 4));
  await touch.cancel();
  await expect(events).toHaveText("zone:cancel:pointerCancel");

  await touch.start(points[0] ?? zone);
  await touch.move(points.slice(1, 3));
  await clickProgrammatically(page, "Change zone context");
  await touch.move(points.slice(3));
  await touch.end();
  await expect(events).toHaveText("zone:cancel:pointerCancel | zone:cancel:detach");
});
