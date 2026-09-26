import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AnalogInputController,
  type AnalogDispatch,
} from "@moritzbrantner/input-bindings-runtime";
import {
  attachGyroscopeAnalog,
  attachTouchLookAnalog,
  attachVirtualStickAnalog,
  gyroscopeEventToAxis2D,
  pointerAxisFromCenter,
  requestDeviceMotionPermission,
  type AnalogPointerEventLike,
} from "../src/index.ts";

class FakePointerTarget {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();
  readonly captured: number[] = [];
  readonly released: number[] = [];

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.released.push(pointerId);
  }

  emit(type: string, event: Partial<AnalogPointerEventLike> & Record<string, unknown>): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeMotionTarget {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function analogController(dispatches: AnalogDispatch[] = []) {
  return new AnalogInputController({
    actions: [
      { id: "game.move", kind: "axis2D" },
      { id: "game.look", kind: "axis2D" },
    ],
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
}

test("pointer center normalization is radial and exact at the control edges", () => {
  const target = new FakePointerTarget();
  assert.deepEqual(
    pointerAxisFromCenter(
      target,
      { clientX: 100, clientY: 50 },
      { deadzone: 0 },
    ),
    { x: 1, y: 0 },
  );
  assert.deepEqual(
    pointerAxisFromCenter(
      target,
      { clientX: 50, clientY: 0 },
      { deadzone: 0, invertY: true },
    ),
    { x: 0, y: 1 },
  );
});

test("virtual stick emits semantic movement and clears it on release", () => {
  const dispatches: AnalogDispatch[] = [];
  const controller = analogController(dispatches);
  const target = new FakePointerTarget();
  const detach = attachVirtualStickAnalog(controller, {
    target,
    action: "game.move",
    deadzone: 0,
    invertY: true,
  });

  target.emit("pointerdown", { pointerId: 4, clientX: 50, clientY: 50 });
  target.emit("pointermove", { pointerId: 4, clientX: 100, clientY: 0 });

  const movement = controller.value("game.move");
  assert.equal(typeof movement, "object");
  if (typeof movement !== "number") {
    assert.ok(Math.abs(movement.x - Math.SQRT1_2) < 1e-12);
    assert.ok(Math.abs(movement.y - Math.SQRT1_2) < 1e-12);
  }
  assert.deepEqual(target.captured, [4]);

  target.emit("pointerup", { pointerId: 4, clientX: 100, clientY: 0 });
  assert.deepEqual(controller.value("game.move"), { x: 0, y: 0 });
  assert.deepEqual(target.released, [4]);
  assert.equal(dispatches.at(-1)?.reason, "release");

  detach();
});

test("touch look uses displacement from touch-down as a normalized look rate", () => {
  const controller = analogController();
  const target = new FakePointerTarget();
  const detach = attachTouchLookAnalog(controller, {
    target,
    action: "game.look",
    sourceId: "touch-look",
    deadzone: 0,
    maxTravelPx: 25,
  });

  target.emit("pointerdown", { pointerId: 2, clientX: 50, clientY: 50 });
  target.emit("pointermove", { pointerId: 2, clientX: 75, clientY: 50 });
  assert.deepEqual(controller.value("game.look"), { x: 1, y: 0 });

  target.emit("pointercancel", { pointerId: 2, clientX: 75, clientY: 50 });
  assert.deepEqual(controller.value("game.look"), { x: 0, y: 0 });
  detach();
});

test("gyroscope samples normalize rotation rate and screen orientation", () => {
  assert.deepEqual(
    gyroscopeEventToAxis2D(
      { rotationRate: { gamma: 90, beta: 45, alpha: 10 } },
      { maxRateDegPerSec: 180, deadzone: 0 },
    ),
    { x: 0.5, y: 0.25 },
  );

  const landscape = gyroscopeEventToAxis2D(
    { rotationRate: { gamma: 90, beta: 45 } },
    { maxRateDegPerSec: 180, deadzone: 0, screenOrientationDegrees: 90 },
  );
  assert.ok(Math.abs(landscape.x - 0.25) < 1e-12);
  assert.ok(Math.abs(landscape.y + 0.5) < 1e-12);
});

test("gyroscope and touch can feed the same semantic look axis", () => {
  const controller = analogController();
  const motion = new FakeMotionTarget();
  const touch = new FakePointerTarget();

  const detachMotion = attachGyroscopeAnalog(controller, {
    target: motion,
    action: "game.look",
    sourceId: "gyro",
    maxRateDegPerSec: 180,
    deadzone: 0,
    smoothing: 1,
    getScreenOrientationDegrees: () => 0,
  });
  const detachTouch = attachTouchLookAnalog(controller, {
    target: touch,
    action: "game.look",
    sourceId: "touch",
    deadzone: 0,
    maxTravelPx: 100,
  });

  motion.emit("devicemotion", {
    rotationRate: { gamma: 45, beta: 0 },
  });
  touch.emit("pointerdown", { pointerId: 1, clientX: 50, clientY: 50 });
  touch.emit("pointermove", { pointerId: 1, clientX: 75, clientY: 50 });

  assert.deepEqual(controller.value("game.look"), { x: 0.5, y: 0 });

  detachTouch();
  assert.deepEqual(controller.value("game.look"), { x: 0.25, y: 0 });
  detachMotion();
  assert.deepEqual(controller.value("game.look"), { x: 0, y: 0 });
});


test("motion permission helper preserves the platform request receiver", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "DeviceMotionEvent");
  const fake = {
    async requestPermission(this: unknown) {
      assert.equal(this, fake);
      return "granted" as const;
    },
  };
  Object.defineProperty(globalThis, "DeviceMotionEvent", {
    configurable: true,
    value: fake,
  });

  try {
    assert.equal(await requestDeviceMotionPermission(), "granted");
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "DeviceMotionEvent", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "DeviceMotionEvent");
    }
  }
});
