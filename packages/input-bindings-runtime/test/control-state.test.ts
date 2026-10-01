import assert from "node:assert/strict";
import { test } from "node:test";

import { SemanticControlState, type RuntimeDispatch } from "../src/index.ts";

function dispatch(
  action: string,
  bindingId: string,
  phase: RuntimeDispatch["phase"],
  reason: RuntimeDispatch["reason"] = "direct",
): RuntimeDispatch {
  return {
    action,
    bindingId,
    phase,
    repeat: phase === "repeat",
    reason,
    sequence: [],
    activeContexts: [],
  };
}

test("held state counts holders per binding and releases only what pressed", () => {
  const state = new SemanticControlState();
  state.apply(dispatch("move.forward", "key", "press"));
  state.apply(dispatch("move.forward", "pad", "press"));
  state.apply(dispatch("move.forward", "key", "repeat"));
  assert.deepEqual(state.snapshot(), {
    held: ["move.forward"],
    holders: { "move.forward": ["key", "pad"] },
  });
  state.apply(dispatch("move.forward", "other", "release"));
  state.apply(dispatch("move.forward", "key", "release", "keyUp"));
  assert.equal(state.isHeld("move.forward"), true);
  state.apply(dispatch("move.forward", "pad", "release", "reset"));
  assert.deepEqual(state.snapshot(), { held: [], holders: {} });
});

test("axes combine opposing held actions", () => {
  const state = new SemanticControlState();
  assert.equal(state.axis("back", "forward"), 0);
  state.apply(dispatch("forward", "w", "press"));
  assert.equal(state.axis("back", "forward"), 1);
  state.apply(dispatch("back", "s", "press"));
  assert.equal(state.axis("back", "forward"), 0);
  state.apply(dispatch("forward", "w", "release"));
  assert.equal(state.axis("back", "forward"), -1);
});

test("gestures count as presses but are never held", () => {
  const state = new SemanticControlState();
  state.apply(dispatch("spell.fire", "rune", "press", "gesture"));
  state.apply(dispatch("spell.fire", "rune", "release", "gesture"));
  assert.equal(state.isHeld("spell.fire"), false);
  assert.deepEqual(state.drainPresses(), ["spell.fire"]);
});

test("clear forgets held state and queued presses", () => {
  const state = new SemanticControlState();
  state.apply(dispatch("jump", "space", "press"));
  state.clear();
  assert.deepEqual(state.snapshot().held, []);
  assert.deepEqual(state.drainPresses(), []);
});
