import assert from "node:assert/strict";
import { test } from "node:test";

import type { PointerStrokeEvent } from "@moritzbrantner/input-bindings-runtime";

import {
  attachPointerStrokeCapture,
  type PointerStrokeCaptureOptions,
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
  rect = { left: 10, top: 20, width: 300, height: 200 };

  getBoundingClientRect() {
    return this.rect;
  }

  setPointerCapture(pointerId: number): void {
    this.captured.push(pointerId);
  }

  releasePointerCapture(pointerId: number): void {
    this.released.push(pointerId);
    // Browsers fire lostpointercapture synchronously after an explicit release.
    this.emit("lostpointercapture", { pointerId });
  }
}

class FakeDocument extends FakeEventTarget {
  visibilityState = "visible";
}

function pointer(
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp: number,
  extra: Partial<PointerStrokeEventLike> = {},
): PointerStrokeEventLike {
  return { pointerId, pointerType: "mouse", clientX, clientY, timeStamp, button: 0, ...extra };
}

function capture(overrides: Partial<PointerStrokeCaptureOptions> = {}) {
  const target = new FakeSurface();
  const focusTarget = new FakeEventTarget();
  const visibilityTarget = new FakeDocument();
  const events: PointerStrokeEvent[] = [];
  const detach = attachPointerStrokeCapture({
    target,
    focusTarget,
    visibilityTarget,
    sourceId: "lab",
    onStroke: (event) => events.push(event),
    ...overrides,
  });
  return { target, focusTarget, visibilityTarget, events, detach };
}

test("a captured mouse stroke completes with element-local samples and releases capture", () => {
  const { target, events } = capture();
  target.emit("pointerdown", pointer(1, 20, 30, 0));
  target.emit("pointermove", pointer(1, 60, 50, 16));
  target.emit("pointerup", pointer(1, 110, 70, 32));

  assert.deepEqual(
    events.map((event) => event.phase),
    ["start", "update", "complete"],
  );
  const stroke = events.at(-1)?.stroke;
  assert.deepEqual(
    stroke?.samples.map(({ x, y }) => [x, y]),
    [
      [10, 10],
      [50, 30],
      [100, 50],
    ],
  );
  assert.deepEqual(target.captured, [1]);
  assert.deepEqual(target.released, [1]);
  assert.equal(stroke?.status, "completed", "the release-triggered lostpointercapture is ignored");
});

test("pointercancel and lostpointercapture cancel the active stroke without stranding it", () => {
  const { target, events } = capture();
  target.emit("pointerdown", pointer(1, 20, 30, 0, { pointerType: "touch" }));
  target.emit("pointercancel", { pointerId: 1 });
  target.emit("pointermove", pointer(1, 40, 40, 10, { pointerType: "touch" }));

  target.emit("pointerdown", pointer(2, 20, 30, 20, { pointerType: "touch" }));
  target.emit("lostpointercapture", { pointerId: 2 });
  target.emit("pointerup", pointer(2, 40, 40, 30, { pointerType: "touch" }));

  assert.deepEqual(
    events.map((event) => [event.phase, event.stroke.pointerId, event.stroke.cancelReason]),
    [
      ["start", 1, undefined],
      ["cancel", 1, "pointerCancel"],
      ["start", 2, undefined],
      ["cancel", 2, "lostPointerCapture"],
    ],
  );
});

test("blur, hidden visibility, and detach cancel active strokes", () => {
  const blurred = capture();
  blurred.target.emit("pointerdown", pointer(1, 20, 30, 0));
  blurred.focusTarget.emit("blur");
  assert.equal(blurred.events.at(-1)?.stroke.cancelReason, "blur");

  const hidden = capture();
  hidden.target.emit("pointerdown", pointer(1, 20, 30, 0));
  hidden.visibilityTarget.emit("visibilitychange");
  assert.equal(hidden.events.at(-1)?.phase, "start", "visible documents do not cancel");
  hidden.visibilityTarget.visibilityState = "hidden";
  hidden.visibilityTarget.emit("visibilitychange");
  assert.equal(hidden.events.at(-1)?.stroke.cancelReason, "hidden");

  const detached = capture();
  detached.target.emit("pointerdown", pointer(1, 20, 30, 0));
  detached.detach();
  assert.equal(detached.events.at(-1)?.stroke.cancelReason, "detach");
  assert.deepEqual(detached.target.released, [1]);
  assert.equal(detached.target.listenerCount(), 0);
  assert.equal(detached.focusTarget.listenerCount(), 0);
  assert.equal(detached.visibilityTarget.listenerCount(), 0);
});

test("pointer type and mouse button filters decide which pointers may start strokes", () => {
  const { target, events } = capture({ pointerTypes: ["touch", "pen"] });
  target.emit("pointerdown", pointer(1, 20, 30, 0));
  assert.deepEqual(events, []);
  target.emit("pointerdown", pointer(2, 20, 30, 0, { pointerType: "pen" }));
  assert.equal(events.at(-1)?.stroke.pointerType, "pen");

  const secondary = capture();
  secondary.target.emit("pointerdown", pointer(1, 20, 30, 0, { button: 2 }));
  assert.deepEqual(secondary.events, []);
  assert.deepEqual(secondary.target.captured, []);
});

test("a second concurrent pointer is ignored without being captured", () => {
  const { target, events } = capture();
  target.emit("pointerdown", pointer(1, 20, 30, 0, { pointerType: "touch" }));
  target.emit("pointerdown", pointer(2, 50, 30, 5, { pointerType: "touch" }));
  target.emit("pointerup", pointer(2, 50, 30, 10, { pointerType: "touch" }));
  assert.deepEqual(target.captured, [1]);
  assert.deepEqual(
    events.map((event) => event.phase),
    ["start"],
  );
});

test("the coalesced policy is explicit: ignored by default, included in browser order on request", () => {
  const coalescedEvents = [pointer(1, 30, 30, 4), pointer(1, 40, 30, 8), pointer(1, 50, 30, 12)];
  const move = pointer(1, 50, 30, 12, { getCoalescedEvents: () => coalescedEvents });

  const ignored = capture();
  ignored.target.emit("pointerdown", pointer(1, 20, 30, 0));
  ignored.target.emit("pointermove", move);
  assert.equal(ignored.events.at(-1)?.stroke.samples.length, 2);

  const included = capture({ coalesced: "include" });
  included.target.emit("pointerdown", pointer(1, 20, 30, 0));
  included.target.emit("pointermove", move);
  assert.deepEqual(
    included.events.at(-1)?.stroke.samples.map((sample) => sample.x),
    [10, 20, 30, 40],
  );
});

test("the stroke surface is frozen at start so mid-stroke layout changes do not rewrite samples", () => {
  const { target, events } = capture();
  target.emit("pointerdown", pointer(1, 20, 30, 0));
  target.rect = { left: 500, top: 500, width: 10, height: 10 };
  target.emit("pointerup", pointer(1, 30, 40, 10));
  assert.deepEqual(events.at(-1)?.stroke.surface, { left: 10, top: 20, width: 300, height: 200 });
  assert.deepEqual(
    events.at(-1)?.stroke.samples.map(({ x, y }) => [x, y]),
    [
      [10, 10],
      [20, 20],
    ],
  );
});
