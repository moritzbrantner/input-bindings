import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import { InputRuntimeController, type RuntimeDispatch } from "@moritzbrantner/input-bindings-runtime";
import {
  attachGamepadRuntime,
  attachMouseRuntime,
  type FrameScheduler,
  type GamepadLike,
} from "../src/index.ts";

class FakeTarget {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const entries = this.listeners.get(type) ?? new Set();
    entries.add(listener);
    this.listeners.set(type, entries);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeFrames implements FrameScheduler {
  private next = 1;
  private readonly callbacks = new Map<number, () => void>();

  requestFrame(callback: () => void): unknown {
    const id = this.next++;
    this.callbacks.set(id, callback);
    return id;
  }

  cancelFrame(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  runNext(): void {
    const entry = [...this.callbacks.entries()].sort(([left], [right]) => left - right)[0];
    assert.ok(entry, "expected a scheduled gamepad frame");
    this.callbacks.delete(entry[0]);
    entry[1]();
  }
}

const mouseRegistry: ActionRegistry = {
  actions: [
    {
      id: "viewport.select",
      title: "Select",
      allowedDevices: ["mouse"],
      defaults: [
        {
          id: "select.mouse",
          action: "viewport.select",
          sequence: [{ device: "mouseButton", button: 0 }],
        },
      ],
    },
    {
      id: "camera.zoomIn",
      title: "Zoom in",
      allowedDevices: ["mouse"],
      defaults: [
        {
          id: "zoom.wheel",
          action: "camera.zoomIn",
          sequence: [{ device: "wheel", direction: "up" }],
        },
      ],
    },
  ],
};

test("mouse button and wheel feed the same runtime lifecycle", () => {
  const target = new FakeTarget();
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: mouseRegistry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const detach = attachMouseRuntime(controller, { target, resetOnDetach: false });
  const base = {
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    preventDefault() {},
  };

  target.emit("mousedown", { ...base, button: 0 });
  target.emit("mouseup", { ...base, button: 0 });
  target.emit("wheel", { ...base, deltaX: 0, deltaY: -20 });

  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [
      ["viewport.select", "press"],
      ["viewport.select", "release"],
      ["camera.zoomIn", "press"],
      ["camera.zoomIn", "release"],
    ],
  );
  detach();
});

const gamepadRegistry: ActionRegistry = {
  actions: [
    {
      id: "game.jump",
      title: "Jump",
      allowedDevices: ["gamepad"],
      defaults: [
        {
          id: "jump.gamepad",
          action: "game.jump",
          sequence: [{ device: "gamepadButton", button: 0, threshold: 50, gamepad: 0 }],
        },
      ],
    },
    {
      id: "game.moveRight",
      title: "Move right",
      allowedDevices: ["gamepad"],
      defaults: [
        {
          id: "move.axis",
          action: "game.moveRight",
          sequence: [
            {
              device: "gamepadAxis",
              axis: 0,
              direction: "positive",
              threshold: 60,
              deadzone: 20,
              gamepad: 0,
            },
          ],
        },
      ],
    },
  ],
};

test("gamepad polling emits button and axis threshold transitions with hysteresis", () => {
  const frames = new FakeFrames();
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: gamepadRegistry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  let pad: GamepadLike = {
    index: 0,
    connected: true,
    buttons: [{ value: 0, pressed: false }],
    axes: [0],
  };
  const detach = attachGamepadRuntime(controller, {
    getGamepads: () => [pad],
    scheduler: frames,
    resetOnDetach: false,
  });

  frames.runNext();
  pad = { ...pad, buttons: [{ value: 0.6, pressed: false }] };
  frames.runNext();
  pad = { ...pad, buttons: [{ value: 0.2, pressed: false }] };
  frames.runNext();

  pad = { ...pad, axes: [0.7] };
  frames.runNext();
  pad = { ...pad, axes: [0.4] };
  frames.runNext();
  pad = { ...pad, axes: [0.1] };
  frames.runNext();

  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [
      ["game.jump", "press"],
      ["game.jump", "release"],
      ["game.moveRight", "press"],
      ["game.moveRight", "release"],
    ],
  );
  detach();
});
