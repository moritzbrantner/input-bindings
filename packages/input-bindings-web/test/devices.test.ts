import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import {
  AnalogInputController,
  InputRuntimeController,
  type AnalogDispatch,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";

import {
  attachGamepadRuntime,
  attachMouseRuntime,
  createActiveDeviceTracker,
  type FrameScheduler,
  type GamepadLike,
  type InputDeviceClass,
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
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
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

function pad(index: number, overrides: Partial<GamepadLike> = {}): GamepadLike {
  return {
    index,
    connected: true,
    buttons: [{ value: 0, pressed: false }],
    axes: [0, 0],
    ...overrides,
  };
}

test("gamepad disconnect mid-hold releases digital and analog input, reconnect resumes once", () => {
  const frames = new FakeFrames();
  const window = new FakeTarget();
  const dispatches: RuntimeDispatch[] = [];
  const analogDispatches: AnalogDispatch[] = [];
  const controller = new InputRuntimeController({
    registry: gamepadRegistry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const analog = new AnalogInputController({
    actions: [{ id: "game.move", kind: "axis2D" }],
    onDispatch: (dispatch) => analogDispatches.push(dispatch),
  });
  let pads: (GamepadLike | null)[] = [
    pad(0, { buttons: [{ value: 1, pressed: true }], axes: [0.5, 0] }),
  ];
  const detach = attachGamepadRuntime(controller, {
    getGamepads: () => pads,
    scheduler: frames,
    eventTarget: window,
    analog: { controller: analog, bindings: [{ action: "game.move", xAxis: 0, yAxis: 1 }] },
    resetOnDetach: false,
  });

  frames.runNext();
  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [["game.jump", "press"]],
  );
  const held = analog.value("game.move") as { x: number; y: number };
  assert.ok(Math.abs(held.x - (0.5 - 0.15) / 0.85) < 1e-9);

  // The browser still lists the pad when the event fires.
  window.emit("gamepaddisconnected", { gamepad: { index: 0 } });
  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [
      ["game.jump", "press"],
      ["game.jump", "release"],
    ],
  );
  assert.deepEqual(analog.value("game.move"), { x: 0, y: 0 });
  assert.equal(analogDispatches.at(-1)?.reason, "release");

  pads = [];
  frames.runNext();
  assert.throws(() => frames.runNext(), /expected a scheduled gamepad frame/);

  pads = [pad(0, { buttons: [{ value: 1, pressed: true }] })];
  window.emit("gamepadconnected", { gamepad: { index: 0 } });
  window.emit("gamepadconnected", { gamepad: { index: 0 } });
  frames.runNext();
  assert.deepEqual(dispatches.map((dispatch) => [dispatch.action, dispatch.phase]).at(-1), [
    "game.jump",
    "press",
  ]);

  detach();
  assert.throws(() => frames.runNext(), /expected a scheduled gamepad frame/, "one poll loop");
  assert.deepEqual(dispatches.map((dispatch) => [dispatch.action, dispatch.phase]).at(-1), [
    "game.jump",
    "release",
  ]);
  window.emit("gamepadconnected", { gamepad: { index: 0 } });
  assert.throws(() => frames.runNext(), /expected a scheduled gamepad frame/, "listeners removed");
});

test("gamepad analog bindings apply dead zones per axis and combine pads as separate sources", () => {
  const frames = new FakeFrames();
  const analog = new AnalogInputController({
    actions: [
      { id: "camera.look", kind: "axis2D" },
      { id: "camera.zoom", kind: "axis1D" },
    ],
  });
  let pads: GamepadLike[] = [pad(0, { axes: [0.1, -0.1, 0.1] })];
  const detach = attachGamepadRuntime(
    new InputRuntimeController({ registry: { actions: [] }, getActiveContexts: () => new Set() }),
    {
      getGamepads: () => pads,
      scheduler: frames,
      eventTarget: new FakeTarget(),
      analog: {
        controller: analog,
        bindings: [
          { action: "camera.look", xAxis: 0, yAxis: 1, invertY: true, deadzone: 0.2 },
          { action: "camera.zoom", axis: 2, deadzone: 0.2 },
        ],
      },
    },
  );

  frames.runNext();
  assert.deepEqual(analog.value("camera.look"), { x: 0, y: 0 });
  assert.equal(analog.value("camera.zoom"), 0);

  pads = [pad(0, { axes: [0, -0.6, -0.6] }), pad(1, { axes: [0, 0, -0.6] })];
  frames.runNext();
  const look = analog.value("camera.look") as { x: number; y: number };
  assert.equal(look.x, 0);
  assert.ok(Math.abs(look.y - 0.5) < 1e-9);
  assert.ok(Math.abs((analog.value("camera.zoom") as number) + 1) < 1e-9);

  detach();
  assert.equal(analog.value("camera.zoom"), 0);
});

test("active device tracker switches between keyboard/mouse, touch and gamepad", () => {
  const frames = new FakeFrames();
  const window = new FakeTarget();
  const tracker = createActiveDeviceTracker({ target: window });
  const changes: InputDeviceClass[] = [];
  tracker.subscribe((device) => changes.push(device));
  let pads: GamepadLike[] = [pad(0)];
  const detach = attachGamepadRuntime(
    new InputRuntimeController({ registry: { actions: [] }, getActiveContexts: () => new Set() }),
    { getGamepads: () => pads, scheduler: frames, eventTarget: window, deviceTracker: tracker },
  );

  assert.equal(tracker.current, null);
  window.emit("keydown", { key: "w" });
  frames.runNext();
  window.emit("pointerdown", { pointerType: "touch" });
  pads = [pad(0, { axes: [0.9, 0] })];
  frames.runNext();
  frames.runNext();
  window.emit("pointerdown", { pointerType: "mouse" });
  window.emit("wheel", {});

  assert.deepEqual(changes, ["keyboardMouse", "touch", "gamepad", "keyboardMouse"]);
  assert.equal(tracker.current, "keyboardMouse");

  detach();
  tracker.detach();
  window.emit("pointerdown", { pointerType: "touch" });
  assert.equal(tracker.current, "keyboardMouse");
});
