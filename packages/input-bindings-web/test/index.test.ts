import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isModifierOnlyKeyboardValue,
  isTextEntryTarget,
  keyboardEventToStroke,
  normalizeLogicalKey,
} from "../src/index.ts";

const baseEvent = {
  key: "K",
  code: "KeyK",
  ctrlKey: true,
  altKey: false,
  shiftKey: false,
  metaKey: false,
};

test("logical mode follows the produced character", () => {
  assert.deepEqual(keyboardEventToStroke(baseEvent), {
    key: { kind: "logical", value: "k" },
    modifiers: { ctrl: true, alt: false, shift: false, meta: false, altGraph: false },
  });
});

test("logical key normalization is locale invariant", () => {
  const originalToLocaleLowerCase = String.prototype.toLocaleLowerCase;
  String.prototype.toLocaleLowerCase = () => "ı";
  try {
    assert.equal(normalizeLogicalKey("I"), "i");
  } finally {
    String.prototype.toLocaleLowerCase = originalToLocaleLowerCase;
  }
});

test("physical mode follows the key position", () => {
  assert.deepEqual(keyboardEventToStroke(baseEvent, { mode: "physical" }), {
    key: { kind: "physical", value: "KeyK" },
    modifiers: { ctrl: true, alt: false, shift: false, meta: false, altGraph: false },
  });
});

test("AltGraph is distinct from Ctrl+Alt by default", () => {
  assert.deepEqual(
    keyboardEventToStroke({
      ...baseEvent,
      key: "@",
      code: "KeyQ",
      ctrlKey: true,
      altKey: true,
      getModifierState: (name) => name === "AltGraph",
    }),
    {
      key: { kind: "logical", value: "@" },
      modifiers: { ctrl: false, alt: false, shift: false, meta: false, altGraph: true },
    },
  );
});

test("modifier-only keyboard values are recognized in logical and physical modes", () => {
  assert.equal(isModifierOnlyKeyboardValue("Control"), true);
  assert.equal(isModifierOnlyKeyboardValue("ControlLeft", "physical"), true);
  assert.equal(isModifierOnlyKeyboardValue("ShiftRight", "physical"), true);
  assert.equal(isModifierOnlyKeyboardValue("KeyK", "physical"), false);
  assert.equal(isModifierOnlyKeyboardValue("k"), false);
});

test("composition and bare modifiers are ignored", () => {
  assert.equal(keyboardEventToStroke({ ...baseEvent, isComposing: true }), null);
  assert.equal(keyboardEventToStroke({ ...baseEvent, key: "Control", code: "ControlLeft" }), null);
});

test("text entry targets are recognized without depending on DOM classes", () => {
  assert.equal(isTextEntryTarget({ tagName: "input" }), true);
  assert.equal(isTextEntryTarget({ isContentEditable: true }), true);
  assert.equal(isTextEntryTarget({ role: "textbox" }), true);
  assert.equal(isTextEntryTarget({ tagName: "button" }), false);
});
