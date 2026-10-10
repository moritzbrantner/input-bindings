import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";

import {
  InputRuntimeController,
  SemanticControlState,
  type RuntimeDecision,
} from "../src/index.ts";

// Mirrors `contexts_and_held_actions_order_by_utf16_code_units` in the Rust runtime tests: a
// supplementary character sorts before a later BMP one in both runtimes.
test("contexts and held actions order by UTF-16 code units", () => {
  const registry: ActionRegistry = {
    actions: [
      ["", "KeyA"],
      ["😀", "KeyB"],
      ["go", "KeyC"],
    ].map(([id, code]) => ({
      id,
      title: id,
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        {
          id: `${id}.default`,
          action: id,
          sequence: [{ key: { kind: "physical", value: code } }],
        },
      ],
    })),
  };
  const state = new SemanticControlState();
  const decisions: RuntimeDecision[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(["", "😀", "g"]),
    onDecision: (decision) => decisions.push(decision),
    onDispatch: (dispatch) => state.apply(dispatch),
  });
  for (const code of ["KeyA", "KeyB", "KeyC"]) {
    controller.handleInputDown({ key: { kind: "physical", value: code } });
  }
  assert.deepEqual(decisions.at(-1)?.activeContexts, ["g", "😀", ""]);
  assert.deepEqual(state.snapshot().held, ["go", "😀", ""]);
});
