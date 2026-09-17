import assert from "node:assert/strict";
import { test } from "node:test";

import type { Binding } from "@moritzbrantner/input-bindings";
import {
  bindingsForScenario,
  deriveContextScenarios,
  scenarioContextFacts,
} from "../src/workbench-model.ts";

const bindings: Binding[] = [
  {
    id: "global.palette",
    action: "global.palette",
    sequence: [{ key: { kind: "logical", value: "p" }, modifiers: { ctrl: true } }],
  },
  {
    id: "editor.save",
    action: "editor.save",
    sequence: [{ key: { kind: "logical", value: "s" }, modifiers: { ctrl: true } }],
    when: { op: "context", id: "editorFocused" },
  },
  {
    id: "game.jump",
    action: "game.jump",
    sequence: [{ key: { kind: "physical", value: "Space" } }],
    when: { op: "context", id: "gameplay" },
  },
  {
    id: "menu.close",
    action: "menu.close",
    sequence: [{ key: { kind: "logical", value: "Escape" } }],
    when: { op: "context", id: "menuOpen" },
  },
];

test("derived scenarios provide a usable global view plus every declared context", () => {
  const scenarios = deriveContextScenarios(bindings);
  assert.deepEqual(
    scenarios.map((scenario) => scenario.id),
    ["global", "context:editorFocused", "context:gameplay", "context:menuOpen"],
  );
  assert.deepEqual(scenarios[1].stack, [{ id: "editorFocused" }]);
});

test("scenario facts merge explicit facts with ordered stack layers", () => {
  assert.deepEqual(
    [...scenarioContextFacts({
      id: "dialog",
      label: "Dialog",
      activeContexts: ["selectionExists"],
      stack: [{ id: "editorFocused" }, { id: "dialogOpen", blocksLower: true }],
    })].sort(),
    ["dialogOpen", "editorFocused", "selectionExists"],
  );
});

test("shortcut reference only shows bindings whose contexts are reachable", () => {
  const editorScenario = {
    id: "editor",
    label: "Editor",
    activeContexts: ["editorFocused"],
    stack: [{ id: "editorFocused" }],
  } as const;

  assert.deepEqual(
    bindingsForScenario(bindings, editorScenario).map((binding) => binding.id),
    ["global.palette", "editor.save"],
  );
});

test("modal scenarios hide lower and fallback bindings just like runtime resolution", () => {
  const modalScenario = {
    id: "pause-menu",
    label: "Pause menu",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [{ id: "gameplay" }, { id: "menuOpen", blocksLower: true }],
  } as const;

  assert.deepEqual(
    bindingsForScenario(bindings, modalScenario).map((binding) => binding.id),
    ["menu.close"],
  );
});
