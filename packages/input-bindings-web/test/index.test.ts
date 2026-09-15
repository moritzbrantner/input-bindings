import assert from "node:assert/strict";
import { test } from "node:test";

import { isTextEntryTarget, keyboardEventToStroke } from "../src/index.ts";

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
