import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AnalogInputController,
  applyAxis1DDeadzone,
  applyAxis2DDeadzone,
  rotateAxis2D,
  smoothAxis2D,
  type AnalogDispatch,
} from "../src/index.ts";

test("analog controller aggregates multiple sources deterministically", () => {
  const dispatches: AnalogDispatch[] = [];
  const controller = new AnalogInputController({
    actions: [{ id: "game.look", kind: "axis2D" }],
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  controller.setAxis2D("touch", "game.look", { x: 0.5, y: 0.25 });
  controller.setAxis2D("gyro", "game.look", { x: 0.25, y: -0.25 });

  assert.deepEqual(controller.value("game.look"), { x: 0.75, y: 0 });
  assert.deepEqual(dispatches.at(-1), {
    action: "game.look",
    kind: "axis2D",
    value: { x: 0.75, y: 0 },
    sourceIds: ["gyro", "touch"],
    reason: "update",
  });

  controller.clearSource("gyro", "game.look");
  assert.deepEqual(controller.value("game.look"), { x: 0.5, y: 0.25 });
  assert.equal(dispatches.at(-1)?.reason, "release");
});

test("analog controller clamps summed values to the normalized unit range", () => {
  const controller = new AnalogInputController({
    actions: [
      { id: "throttle", kind: "axis1D" },
      { id: "move", kind: "axis2D" },
    ],
  });

  controller.setAxis1D("a", "throttle", 0.8);
  controller.setAxis1D("b", "throttle", 0.8);
  assert.equal(controller.value("throttle"), 1);

  controller.setAxis2D("a", "move", { x: 1, y: 0 });
  controller.setAxis2D("b", "move", { x: 1, y: 1 });
  const move = controller.value("move");
  assert.equal(typeof move, "object");
  if (typeof move !== "number") {
    assert.ok(Math.hypot(move.x, move.y) <= 1.0000000001);
  }
});

test("clearing and resetting continuous sources emit zero once", () => {
  const dispatches: AnalogDispatch[] = [];
  const controller = new AnalogInputController({
    actions: [{ id: "move", kind: "axis2D" }],
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });

  controller.setAxis2D("stick", "move", { x: 0.5, y: 0 });
  const released = controller.clearSource("stick");
  assert.deepEqual(released, [
    {
      action: "move",
      kind: "axis2D",
      value: { x: 0, y: 0 },
      sourceIds: [],
      reason: "release",
    },
  ]);
  assert.deepEqual(controller.clearSource("stick"), []);

  controller.setAxis2D("stick", "move", { x: 0, y: -0.5 });
  assert.equal(controller.reset().at(0)?.reason, "reset");
  assert.deepEqual(controller.value("move"), { x: 0, y: 0 });
});

test("analog configuration rejects duplicate, unknown, and mismatched action kinds", () => {
  assert.throws(
    () =>
      new AnalogInputController({
        actions: [
          { id: "move", kind: "axis2D" },
          { id: "move", kind: "axis2D" },
        ],
      }),
    /Duplicate analog action id/,
  );

  const controller = new AnalogInputController({
    actions: [{ id: "move", kind: "axis2D" }],
  });
  assert.throws(() => controller.setAxis1D("source", "move", 1), /expects axis2D/);
  assert.throws(
    () => controller.setAxis2D("source", "missing", { x: 1, y: 0 }),
    /Unknown analog action/,
  );
});

test("analog processors provide remapped deadzones, smoothing, and orientation rotation", () => {
  assert.equal(applyAxis1DDeadzone(0.2, 0.2), 0);
  assert.equal(applyAxis1DDeadzone(0.6, 0.2), 0.5);

  const radial = applyAxis2DDeadzone({ x: 0.6, y: 0 }, 0.2);
  assert.deepEqual(radial, { x: 0.49999999999999994, y: 0 });

  assert.deepEqual(smoothAxis2D({ x: 0, y: 0 }, { x: 1, y: -1 }, 0.5), {
    x: 0.5,
    y: -0.5,
  });

  const rotated = rotateAxis2D({ x: 1, y: 0 }, 90);
  assert.ok(Math.abs(rotated.x) < 1e-12);
  assert.ok(Math.abs(rotated.y - 1) < 1e-12);
});
