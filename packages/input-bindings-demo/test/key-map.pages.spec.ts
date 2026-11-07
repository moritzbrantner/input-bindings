import { expect, test } from "@playwright/test";

test("the key map shows Ctrl+F resolving differently per context", async ({ page }) => {
  await page.goto("./");
  await page
    .getByRole("tablist", { name: "Input settings tasks" })
    .getByRole("tab", { name: "Key map", exact: true })
    .click();

  await page.getByRole("searchbox", { name: "Find an input or action" }).fill("ctrl+f");
  const tree = page.getByRole("list", { name: "Inputs by context" });
  await expect(tree.getByText("Ctrl+f", { exact: true })).toBeVisible();

  const branches = page.getByRole("list", { name: "Ctrl+f by context" });
  const branch = (context: string) =>
    branches.getByRole("listitem").filter({ hasText: new RegExp(`^${context}→`) });
  await expect(branch("Global shell")).toContainText("Open search");
  await expect(branch("Gameplay")).toContainText("Strong attack");
  await expect(branch("Gameplay")).toContainText("Shadowed: Open search (lower context layer)");
  await expect(branch("Settings menu")).toContainText("Focus settings search");
  await expect(branch("Editor focused")).toContainText("Find in editor");
  await expect(branch("Gameplay \\+ modal menu")).toContainText("Nothing");
  await expect(branch("Gameplay \\+ modal menu")).toContainText("blocked by modal layer");
});
