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
});

test("sequence and binding lookup expose occupied keyboard positions", () => {
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

  assert.deepEqual(codesForSequence(bindings[0].sequence, germanishLayout), ["KeyY"]);
  assert.deepEqual(bindingIdsForCode(bindings, "KeyY", germanishLayout), ["logical.z"]);
  assert.deepEqual(bindingIdsForCode(bindings, "Space", germanishLayout), ["physical.space"]);
});
