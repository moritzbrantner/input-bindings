import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry, GestureMatch } from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  type PointerStrokeEvent,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";

import { attachGestureRuntime, attachMultiPointerGestures } from "../src/index.ts";

class FakeSurface {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  readonly captured: number[] = [];

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 400 };
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(): void {}

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

const idle = { addEventListener() {}, removeEventListener() {} };

const binding = (id: string, action: string, gesture: GestureMatch) => ({
  id,
  action,
  sequence: [{ device: "gesture" as const, gesture }],
});

const registry: ActionRegistry = {
  actions: [
    {
      id: "view.zoomIn",
      title: "Zoom in",
      allowedDevices: ["pointer"],
      defaults: [binding("zoom.in", "view.zoomIn", { kind: "pinch", direction: "out" })],
    },
    {
      id: "camera.pan",
      title: "Pan",
      allowedDevices: ["pointer"],
      defaults: [binding("pan", "camera.pan", { kind: "drag" })],
    },
  ],
};

const touch = (pointerId: number, clientX: number, clientY: number, timeStamp: number) => ({
  pointerId,
  pointerType: "touch",
  button: 0,
  clientX,
  clientY,
  timeStamp,
});

function setup() {
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  return { controller, dispatches, surface: new FakeSurface() };
}

function pinchOut(surface: FakeSurface) {
  surface.emit("pointerdown", touch(1, 150, 200, 0));
  surface.emit("pointermove", touch(1, 140, 200, 10));
  surface.emit("pointerdown", touch(2, 250, 200, 20));
  for (let step = 1; step <= 5; step += 1) {
    surface.emit("pointermove", touch(1, 140 - step * 12, 200, 20 + step * 16));
    surface.emit("pointermove", touch(2, 250 + step * 12, 200, 20 + step * 16));
  }
  surface.emit("pointerup", touch(2, 310, 200, 120));
  surface.emit("pointerup", touch(1, 80, 200, 130));
}

test("a two-finger pinch resolves through the runtime with session evidence", () => {
  const { controller, dispatches, surface } = setup();
  const phases: string[] = [];
  attachMultiPointerGestures(controller, {
    target: surface,
    focusTarget: idle,
    visibilityTarget: idle,
    onSession: (event) => phases.push(event.phase),
  });
  pinchOut(surface);

  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [
      ["view.zoomIn", "press"],
      ["view.zoomIn", "release"],
    ],
  );
  assert.deepEqual(dispatches[0]?.gesture?.match, { kind: "pinch", direction: "out" });
  assert.equal(phases[0], "start");
  assert.equal(phases.at(-1), "complete");
  assert.deepEqual(surface.captured, [1, 2]);
});

test("composed with stroke capture, a second finger takes over from the single stroke", () => {
  const { controller, dispatches, surface } = setup();
  const strokes: PointerStrokeEvent[] = [];
  attachGestureRuntime(controller, {
    target: surface,
    focusTarget: idle,
    visibilityTarget: idle,
    cancelOnAdditionalPointer: true,
    onStroke: (event) => strokes.push(event),
  });
  attachMultiPointerGestures(controller, {
    target: surface,
    focusTarget: idle,
    visibilityTarget: idle,
  });
  pinchOut(surface);

  assert.deepEqual(
    strokes
      .filter((event) => event.phase !== "update")
      .map((event) => [event.phase, event.stroke.cancelReason]),
    [
      ["start", undefined],
      ["cancel", "multiPointer"],
    ],
  );
  assert.deepEqual(
    dispatches.map((dispatch) => dispatch.action),
    ["view.zoomIn", "view.zoomIn"],
    "the cancelled single stroke never dispatches a drag",
  );

  surface.emit("pointerdown", touch(5, 100, 100, 200));
  surface.emit("pointermove", touch(5, 200, 100, 600));
  surface.emit("pointerup", touch(5, 300, 100, 1000));
  assert.equal(dispatches.at(-1)?.action, "camera.pan", "single-finger strokes still work");
});

test("a cancelled pointer cancels the session and nothing dispatches", () => {
  const { controller, dispatches, surface } = setup();
  const phases: string[] = [];
  const detach = attachMultiPointerGestures(controller, {
    target: surface,
    focusTarget: idle,
    visibilityTarget: idle,
    onSession: (event) => phases.push(event.phase),
  });
  surface.emit("pointerdown", touch(1, 150, 200, 0));
  surface.emit("pointerdown", touch(2, 250, 200, 10));
  surface.emit("pointermove", touch(2, 390, 200, 20));
  surface.emit("pointercancel", { pointerId: 1 });
  surface.emit("pointerup", touch(2, 390, 200, 30));
  assert.deepEqual(phases, ["start", "update", "cancel"]);
  assert.deepEqual(dispatches, []);

  surface.emit("pointerdown", touch(3, 150, 200, 40));
  surface.emit("pointerdown", touch(4, 250, 200, 50));
  detach();
  assert.equal(phases.at(-1), "cancel");
});

test("mouse pointers do not join two-pointer sessions by default", () => {
  const { controller, surface } = setup();
  const phases: string[] = [];
  attachMultiPointerGestures(controller, {
    target: surface,
    focusTarget: idle,
    visibilityTarget: idle,
    onSession: (event) => phases.push(event.phase),
  });
  surface.emit("pointerdown", { ...touch(1, 100, 100, 0), pointerType: "mouse" });
  surface.emit("pointerdown", touch(2, 200, 100, 10));
  assert.deepEqual(phases, []);
});
