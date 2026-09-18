import assert from "node:assert/strict";
import { test } from "node:test";

import type { Binding } from "@moritzbrantner/input-bindings";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { KeyboardView } from "@moritzbrantner/input-bindings-react";
import {
  bindingIdsForCode,
  codeForStroke,
  codesForSequence,
  createKeyboardBindingIndex,
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


test("keyboard binding index preserves per-key lookup semantics", () => {
  const bindings: Binding[] = [
    {
      id: "logical.z",
      action: "editor.zoom",
      sequence: [{ key: { kind: "logical", value: "z" }, modifiers: { ctrl: true } }],
    },
    {
      id: "logical.z.alt",
      action: "editor.altZoom",
      sequence: [{ key: { kind: "logical", value: "z" }, modifiers: { alt: true } }],
    },
    {
      id: "physical.space",
      action: "game.jump",
      sequence: [{ key: { kind: "physical", value: "Space" } }],
    },
  ];

  const index = createKeyboardBindingIndex(bindings, germanishLayout);
  for (const code of ["KeyY", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "Space"]) {
    assert.deepEqual(
      index.get(code) ?? [],
      bindingIdsForCode(bindings, code, germanishLayout),
      code,
    );
  }
});

test("keyboard view indexes logical strokes once instead of rescanning bindings per key", () => {
  class CountingLayoutMap extends Map<string, string> {
    entriesCalls = 0;

    override entries(): MapIterator<[string, string]> {
      this.entriesCalls += 1;
      return super.entries();
    }
  }

  const layout = new CountingLayoutMap([
    ["KeyY", "z"],
    ["KeyZ", "y"],
  ]);
  const bindingCount = 48;
  const bindings: Binding[] = Array.from({ length: bindingCount }, (_, index) => ({
    id: `logical.z.${String(index).padStart(2, "0")}`,
    action: `action.${index}`,
    sequence: [{ key: { kind: "logical" as const, value: "z" } }],
  }));

  renderToStaticMarkup(
    createElement(KeyboardView, {
      bindings,
      layoutLabels: layout,
    }),
  );

  assert.equal(
    layout.entriesCalls,
    bindingCount,
    "default keyboard rendering should build one binding-code index, not rescan bindings for every key",
  );
});
