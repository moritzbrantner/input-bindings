import assert from "node:assert/strict";
import { test } from "node:test";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import {
  InputRuntimeController,
  type PressGestureEvent,
  type RuntimeDispatch,
} from "@moritzbrantner/input-bindings-runtime";

import {
  attachMouseRuntime,
  attachPressGesture,
  type PressGestureCaptureOptions,
  type PointerStrokeEventLike,
} from "../src/index.ts";

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  listenerCount(): number {
    let count = 0;
    for (const listeners of this.listeners.values()) {
      count += listeners.size;
    }
    return count;
  }

  emit(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

class FakeSurface extends FakeEventTarget {
  readonly captured: number[] = [];
  readonly released: number[] = [];

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600 };
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.released.push(pointerId);
    this.emit("lostpointercapture", { pointerId });
  }
}

class FakeDocument extends FakeEventTarget {
  visibilityState = "visible";
}

type PointerExtra = Partial<PointerStrokeEventLike> & { defaultPrevented?: boolean };

function pointer(
  clientX: number,
  clientY: number,
  timeStamp: number,
  extra: PointerExtra = {},
): PointerStrokeEventLike & { prevented: () => boolean } {
  let prevented = false;
  return {
    pointerId: 1,
    pointerType: "mouse",
    clientX,
    clientY,
    timeStamp,
    button: -1,
    buttons: 0,
    preventDefault: () => {
      prevented = true;
    },
    prevented: () => prevented,
    ...extra,
  };
}

function attach(overrides: Partial<PressGestureCaptureOptions> = {}) {
  const target = new FakeSurface();
  const focusTarget = new FakeEventTarget();
  const visibilityTarget = new FakeDocument();
  const events: PressGestureEvent[] = [];
  const handle = attachPressGesture({
    target,
    focusTarget,
    visibilityTarget,
    button: 2,
    onGesture: (event) => events.push(event),
    ...overrides,
  });
  return { target, focusTarget, visibilityTarget, events, handle };
}

const types = (events: readonly PressGestureEvent[]) => events.map((event) => event.type);

test("a right click selects at the press position and releases capture", () => {
  const { target, events } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  target.emit("pointermove", pointer(104, 103, 16, { buttons: 2 }));
  target.emit("pointerup", pointer(105, 103, 120, { button: 2, buttons: 0 }));

  assert.deepEqual(types(events), ["pending", "click"]);
  const click = events.at(-1);
  if (click?.type === "click") {
    assert.deepEqual(click.position, { x: 100, y: 100 });
  }
  assert.deepEqual(target.captured, [1]);
  assert.deepEqual(target.released, [1]);
});

test("a right drag orbits with deltas and never clicks on release", () => {
  const { target, events } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  target.emit("pointermove", pointer(130, 100, 16, { buttons: 2 }));
  target.emit("pointermove", pointer(150, 90, 32, { buttons: 2 }));
  target.emit("pointerup", pointer(150, 90, 48, { button: 2, buttons: 0 }));

  assert.deepEqual(types(events), ["pending", "dragStart", "dragMove", "dragEnd"]);
  const deltas = events.flatMap((event) =>
    event.type === "dragStart" || event.type === "dragMove" ? [event.delta] : [],
  );
  assert.deepEqual(deltas, [
    { x: 30, y: 0 },
    { x: 20, y: -10 },
  ]);
});

test("other buttons never start or end the owned gesture", () => {
  const { target, events } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 0, buttons: 1 }));
  target.emit("pointerup", pointer(100, 100, 10, { button: 0, buttons: 0 }));
  assert.deepEqual(events, []);
  assert.deepEqual(target.captured, []);
});

test("a held left-button attack is unaffected by a right click or drag", () => {
  const registry: ActionRegistry = {
    actions: [
      {
        id: "combat.attack",
        title: "Attack",
        repeatPolicy: "never",
        allowedDevices: ["mouse"],
        defaults: [
          {
            id: "attack.lmb",
            action: "combat.attack",
            sequence: [{ device: "mouseButton", button: 0 }],
          },
        ],
      },
    ],
  };
  const dispatches: RuntimeDispatch[] = [];
  const controller = new InputRuntimeController({
    registry,
    getActiveContexts: () => new Set(),
    onDispatch: (dispatch) => dispatches.push(dispatch),
  });
  const { target, events } = attach();
  const detachMouse = attachMouseRuntime(controller, { target });
  const mouse = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: false };

  // Left attack held first; the right button then arrives as a pointermove transition.
  target.emit("mousedown", { ...mouse, button: 0 });
  target.emit("pointerdown", pointer(100, 100, 0, { button: 0, buttons: 1 }));
  target.emit("pointermove", pointer(100, 100, 10, { button: 2, buttons: 3 }));
  target.emit("pointermove", pointer(140, 100, 20, { buttons: 3 }));
  // Right released while the left stays held: still a pointermove transition.
  target.emit("pointermove", pointer(140, 100, 30, { button: 2, buttons: 1 }));
  assert.deepEqual(types(events), ["pending", "dragStart", "dragEnd"]);
  assert.deepEqual(target.released, [], "capture stays while the left button is held");
  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [["combat.attack", "press"]],
    "the attack is still held",
  );

  // A right click while the attack is still held.
  target.emit("pointermove", pointer(140, 100, 40, { button: 2, buttons: 3 }));
  target.emit("pointermove", pointer(140, 100, 50, { button: 2, buttons: 1 }));
  assert.deepEqual(types(events).slice(3), ["pending", "click"]);

  target.emit("mouseup", { ...mouse, button: 0 });
  target.emit("pointerup", pointer(140, 100, 60, { button: 0, buttons: 0 }));
  assert.deepEqual(
    dispatches.map((dispatch) => [dispatch.action, dispatch.phase]),
    [
      ["combat.attack", "press"],
      ["combat.attack", "release"],
    ],
  );
  assert.deepEqual(types(events).slice(5), [], "the left release produces no gesture outcome");
  detachMouse();
});

test("a right release that is the last button ends through pointerup", () => {
  const { target, events } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 0, buttons: 1 }));
  target.emit("pointermove", pointer(100, 100, 10, { button: 2, buttons: 3 }));
  target.emit("pointermove", pointer(100, 100, 20, { button: 0, buttons: 2 }));
  assert.deepEqual(types(events), ["pending"], "releasing the left button does not end it");
  target.emit("pointerup", pointer(100, 100, 30, { button: 2, buttons: 0 }));
  assert.deepEqual(types(events), ["pending", "click"]);
});

test("concurrent touch pointers do not displace the owner", () => {
  const { target, events } = attach({ button: 0 });
  const touch = (id: number, x: number, t: number, extra: PointerExtra = {}) =>
    pointer(x, 100, t, { pointerId: id, pointerType: "touch", button: 0, buttons: 1, ...extra });
  target.emit("pointerdown", touch(1, 100, 0));
  target.emit("pointerdown", touch(2, 300, 5));
  target.emit("pointermove", touch(2, 400, 10, { button: -1 }));
  target.emit("pointercancel", { pointerId: 2 });
  target.emit("pointerup", touch(2, 400, 15, { buttons: 0 }));
  target.emit("pointerup", touch(1, 102, 20, { buttons: 0 }));

  assert.deepEqual(
    events.map((event) => [event.type, event.gesture.pointerId]),
    [
      ["pending", 1],
      ["click", 1],
    ],
  );
  assert.deepEqual(target.captured, [1]);
});

test("pointercancel, lost capture, blur, hidden, and context change cancel without a command", () => {
  const scenarios: Array<[string, (setup: ReturnType<typeof attach>) => void]> = [
    ["pointerCancel", ({ target }) => target.emit("pointercancel", { pointerId: 1 })],
    ["lostPointerCapture", ({ target }) => target.emit("lostpointercapture", { pointerId: 1 })],
    ["blur", ({ focusTarget }) => focusTarget.emit("blur")],
    [
      "hidden",
      ({ visibilityTarget }) => {
        visibilityTarget.visibilityState = "hidden";
        visibilityTarget.emit("visibilitychange");
      },
    ],
    ["contextChange", ({ handle }) => handle.cancel()],
  ];
  for (const [reason, cancel] of scenarios) {
    for (const drag of [false, true]) {
      const setup = attach();
      const { target, events } = setup;
      target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
      if (drag) {
        target.emit("pointermove", pointer(150, 100, 10, { buttons: 2 }));
      }
      cancel(setup);
      target.emit("pointermove", pointer(200, 100, 20, { buttons: 2 }));
      target.emit("pointerup", pointer(200, 100, 30, { button: 2, buttons: 0 }));
      const outcomes = events.filter(
        (event) => event.type !== "pending" && !event.type.startsWith("drag"),
      );
      assert.deepEqual(
        outcomes.map((event) => (event.type === "cancel" ? event.reason : event.type)),
        [reason],
        `${reason} while ${drag ? "dragging" : "pending"}`,
      );
      assert.ok(!events.some((event) => event.type === "dragEnd" || event.type === "click"));
    }
  }
});

test("the context menu is only suppressed when the surface opts in", () => {
  const plain = attach();
  const ignored = pointer(0, 0, 0);
  plain.target.emit("contextmenu", ignored);
  assert.equal(ignored.prevented(), false);

  const opted = attach({ suppressContextMenu: true });
  const suppressed = pointer(0, 0, 0);
  opted.target.emit("contextmenu", suppressed);
  assert.equal(suppressed.prevented(), true);
  opted.handle.detach();
  assert.equal(opted.target.listenerCount(), 0);
});

test("detach cancels the owned gesture, releases capture, and removes listeners", () => {
  const { target, focusTarget, visibilityTarget, events, handle } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  handle.detach();
  assert.deepEqual(types(events), ["pending", "cancel"]);
  const cancel = events.at(-1);
  if (cancel?.type === "cancel") {
    assert.equal(cancel.reason, "detach");
  }
  assert.deepEqual(target.released, [1]);
  assert.equal(target.listenerCount(), 0);
  assert.equal(focusTarget.listenerCount(), 0);
  assert.equal(visibilityTarget.listenerCount(), 0);
});

test("owned pointer events are only prevented when the surface opts in", () => {
  const plain = attach();
  const down = pointer(100, 100, 0, { button: 2, buttons: 2 });
  plain.target.emit("pointerdown", down);
  assert.equal(down.prevented(), false, "compatibility mouse events keep flowing by default");

  const opted = attach({ preventDefault: true });
  const ownedDown = pointer(100, 100, 0, { button: 2, buttons: 2 });
  const otherDown = pointer(100, 100, 0, { pointerId: 2, button: 0, buttons: 1 });
  opted.target.emit("pointerdown", ownedDown);
  opted.target.emit("pointerdown", otherDown);
  assert.equal(ownedDown.prevented(), true);
  assert.equal(otherDown.prevented(), false);
});

test("detach releases capture even after the gesture was already cancelled", () => {
  const { target, events, handle } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  handle.cancel();
  handle.detach();
  assert.deepEqual(types(events), ["pending", "cancel"]);
  assert.deepEqual(target.released, [1]);
});

test("detach releases capture kept for another held button after the owned release", () => {
  const { target, events, handle } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  target.emit("pointermove", pointer(100, 100, 10, { button: 0, buttons: 3 }));
  target.emit("pointermove", pointer(100, 100, 20, { button: 2, buttons: 1 }));
  assert.deepEqual(types(events), ["pending", "click"]);
  assert.deepEqual(target.released, [], "capture stays while the left button is held");
  handle.detach();
  assert.deepEqual(target.released, [1]);
});

test("capture the browser already dropped is not released again on detach", () => {
  const { target, handle } = attach();
  target.emit("pointerdown", pointer(100, 100, 0, { button: 2, buttons: 2 }));
  target.emit("pointercancel", { pointerId: 1 });
  handle.detach();
  assert.deepEqual(target.released, []);
});
