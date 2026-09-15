import assert from "node:assert/strict";
import { test } from "node:test";

import type { Binding } from "@moritzbrantner/input-bindings";
import {
  bindingIdsForCode,
  codeForStroke,
  codesForSequence,
  keyboardLabelForCode,
} from "../src/keyboard.ts";

const germanishLayout = new Map([
  ["KeyY", "z"],
  ["KeyZ", "y"],
  ["KeyA", "a"],
  ["Space", " "],
]);

test("logical strokes use the browser layout map while physical strokes stay positional", () => {
  assert.equal(
    codeForStroke({ key: { kind: "logical", value: "z" } }, germanishLayout),
    "KeyY",
  );
  assert.equal(
    codeForStroke({ key: { kind: "physical", value: "KeyZ" } }, germanishLayout),
    "KeyZ",
  );
  assert.equal(keyboardLabelForCode("KeyY", germanishLayout), "Z");
  assert.equal(keyboardLabelForCode("Space", germanishLayout), "Space");
});

test("sequence and binding lookup expose primary and modifier positions", () => {
  const bindings: Binding[] = [
    {
      id: "logical.z",
      action: "editor.zoom",
      sequence: [{ key: { kind: "logical", value: "z" }, modifiers: { ctrl: true } }],
    },
    {
      id: "physical.space",
      action: "game.jump",
      sequence: [{ key: { kind: "physical", value: "Space" } }],
    },
  ];

  assert.deepEqual(codesForSequence(bindings[0].sequence, germanishLayout), [
    "ControlLeft",
    "ControlRight",
    "KeyY",
  ]);
  assert.deepEqual(bindingIdsForCode(bindings, "KeyY", germanishLayout), ["logical.z"]);
  assert.deepEqual(bindingIdsForCode(bindings, "ControlLeft", germanishLayout), ["logical.z"]);
  assert.deepEqual(bindingIdsForCode(bindings, "Space", germanishLayout), ["physical.space"]);
});
