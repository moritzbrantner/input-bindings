import { expect, test } from "@playwright/test";

test("the right button selects on click and orbits on drag", async ({ page }) => {
  await page.goto("./devices.html");
  const surface = page.getByLabel("Mouse input test surface");
  await expect(surface).toBeVisible();
  const box = await surface.boundingBox();
  expect(box).not.toBeNull();
  const origin = { x: (box?.x ?? 0) + 40, y: (box?.y ?? 0) + 20 };

  await page.mouse.move(origin.x, origin.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(origin.x + 3, origin.y + 2);
  await expect(page.getByLabel("Right button phase")).toHaveText("pending");
  await page.mouse.up({ button: "right" });
  await expect(page.getByLabel("Last outcome")).toHaveText("select");
  await expect(page.getByLabel("Selected target")).toHaveText("40, 20");

  await page.mouse.down({ button: "right" });
  await page.mouse.move(origin.x + 60, origin.y + 10, { steps: 5 });
  await expect(page.getByLabel("Right button phase")).toHaveText("drag");
  await page.mouse.up({ button: "right" });
  await expect(page.getByLabel("Last outcome")).toHaveText("orbit");
  await expect(page.getByLabel("Camera orbit")).toHaveText("57, 8");
  await expect(page.getByLabel("Selected target")).toHaveText("40, 20");
});
