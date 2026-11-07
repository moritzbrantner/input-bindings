// A small expected-behavior model independent of the workbench implementation.
// ROADMAP.md phases 3/12/13: edit/cancel/save/reset, conflict review and live preview.
import { expect, test, type Page } from "@playwright/test";
import { createMachine, type AnyMachineSnapshot } from "xstate";
import { getAdjacencyMap, getShortestPaths } from "xstate/graph";

const events = [
  "EDIT",
  "CANCEL",
  "SAVE",
  "RESET",
  "CONFLICTS",
  "PREVIEW",
  "BACK",
  "START",
  "STOP",
] as const;
type State = "bindings" | "editing" | "changed" | "conflicts" | "preview" | "previewing";
type Step = { event: { type: string }; state: { value: State } };
type RawPath = { steps: Step[]; state: unknown };

const model = createMachine({
  id: "input-settings-workbench",
  initial: "bindings",
  states: {
    bindings: { on: { EDIT: "editing", CONFLICTS: "conflicts", PREVIEW: "preview" } },
    editing: { on: { CANCEL: "bindings", SAVE: "changed" } },
    changed: { on: { RESET: "bindings" } },
    conflicts: { on: { BACK: "bindings" } },
    preview: { on: { BACK: "bindings", START: "previewing" } },
    previewing: { on: { STOP: "preview" } },
  },
});

const options = {
  events: events.map((type) => ({ type })),
  filterEvents: (snapshot: AnyMachineSnapshot, event: { type: string }) => snapshot.can(event),
  limit: 100,
};
const shortest = new Map(
  (getShortestPaths(model, options) as unknown as RawPath[]).map((path) => [
    JSON.stringify(path.state),
    path.steps.filter((step) => step.event.type !== "xstate.init"),
  ]),
);
const adjacency = getAdjacencyMap(model, options) as unknown as Record<
  string,
  { state: unknown; transitions: Record<string, Step> }
>;
const candidatePaths: Step[][] = [...shortest.values()];
const transitions = new Set<string>();
for (const vertex of Object.values(adjacency)) {
  const prefix = shortest.get(JSON.stringify(vertex.state));
  if (!prefix) {
    throw new Error("Unreachable state in input settings model");
  }
  for (const transition of Object.values(vertex.transitions)) {
    transitions.add(`${JSON.stringify(vertex.state)}:${transition.event.type}`);
    candidatePaths.push([...prefix, transition]);
  }
}
const unique = new Map(
  candidatePaths
    .filter((path) => path.length > 0)
    .map((path) => [path.map((step) => step.event.type).join(" > "), path]),
);
const paths = [...unique]
  .filter(
    ([key]) => ![...unique.keys()].some((other) => other !== key && other.startsWith(`${key} > `)),
  )
  .sort(([left], [right]) => left.localeCompare(right));

test("input-settings model covers every declared transition within its budget", () => {
  expect(transitions.size).toBe(10);
  expect(paths.length).toBeGreaterThan(0);
  expect(paths.length).toBeLessThanOrEqual(16);
});

const tabs = (page: Page) => page.getByRole("tablist", { name: "Input settings tasks" });
const saveRow = (page: Page) => page.getByRole("row").filter({ hasText: "Save document" });
const recorder = (page: Page) => page.locator(".ib-recorder");

async function assertState(page: Page, state: State): Promise<void> {
  let tab = "Bindings";
  if (state === "conflicts") {
    tab = "Conflicts";
  } else if (state === "preview" || state === "previewing") {
    tab = "Try shortcuts";
  }
  await expect(tabs(page).getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  switch (state) {
    case "bindings":
      await expect(
        page.getByRole("searchbox", { name: "Search actions or shortcuts" }),
      ).toBeVisible();
      await expect(recorder(page)).toBeHidden();
      await expect(saveRow(page).getByText("Changed", { exact: true })).toHaveCount(0);
      break;
    case "editing":
      await expect(
        recorder(page).getByRole("button", { name: "Cancel", exact: true }),
      ).toBeVisible();
      await expect(recorder(page).getByRole("button", { name: "Save", exact: true })).toBeVisible();
      break;
    case "changed":
      await expect(recorder(page)).toBeHidden();
      await expect(saveRow(page).getByText("Changed", { exact: true })).toBeVisible();
      break;
    case "conflicts":
      await expect(page.getByRole("heading", { name: "Conflict review" })).toBeVisible();
      break;
    case "preview":
      await expect(page.getByRole("button", { name: "Start preview" })).toBeVisible();
      break;
    case "previewing":
      await expect(page.getByRole("button", { name: "Stop preview" })).toBeVisible();
      break;
  }
}

async function runEvent(page: Page, event: string): Promise<void> {
  switch (event) {
    case "EDIT":
      await page
        .getByRole("searchbox", { name: "Search actions or shortcuts" })
        .fill("Save document");
      await saveRow(page).getByRole("button", { name: "Edit", exact: true }).click();
      break;
    case "CANCEL":
      await recorder(page).getByRole("button", { name: "Cancel", exact: true }).click();
      break;
    case "SAVE": {
      const manual = page.getByLabel("Manual shortcut entry");
      await manual.getByLabel("Manual key or code").fill("k");
      await manual.getByRole("button", { name: "Set shortcut" }).click();
      await recorder(page).getByRole("button", { name: "Save", exact: true }).click();
      break;
    }
    case "RESET":
      await page.getByRole("button", { name: "Reset all", exact: true }).click();
      break;
    case "CONFLICTS":
      await tabs(page).getByRole("tab", { name: "Conflicts", exact: true }).click();
      break;
    case "PREVIEW":
      await tabs(page).getByRole("tab", { name: "Try shortcuts", exact: true }).click();
      break;
    case "BACK":
      await tabs(page).getByRole("tab", { name: "Bindings", exact: true }).click();
      break;
    case "START":
      await page.getByRole("button", { name: "Start preview" }).click();
      break;
    case "STOP":
      await page.getByRole("button", { name: "Stop preview" }).click();
      break;
    default:
      throw new Error(`Unknown expected event ${event}`);
  }
}

for (const [name, path] of paths) {
  test(`@state:input-settings ${name}`, async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Controls" })).toBeVisible();
    await assertState(page, "bindings");
    for (const step of path) {
      await test.step(`${step.event.type} -> ${step.state.value}`, async () => {
        await runEvent(page, step.event.type);
        await assertState(page, step.state.value);
      });
    }
  });
}
