import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS,
  PressGestureTracker,
  type PointerSampleInput,
  type PointerStrokeCancelReason,
  type PressGestureEvent,
  type PointerSurface,
} from "../src/index.ts";

const surface: PointerSurface = { left: 100, top: 50, width: 400, height: 300 };

function input(
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp: number,
  pointerType = "mouse",
): PointerSampleInput {
  return { pointerId, pointerType, clientX, clientY, timeStamp, buttons: 2 };
}

function tracker(dragThresholdPx?: number) {
  const events: PressGestureEvent[] = [];
  const gestures = new PressGestureTracker({
    sourceId: "rmb",
    button: 2,
    dragThresholdPx,
    onGesture: (event) => events.push(event),
  });
  return { gestures, events };
}

const OUTCOMES = new Set(["click", "dragEnd", "cancel"]);

function outcomes(events: readonly PressGestureEvent[]) {
  return events.filter((event) => OUTCOMES.has(event.type));
}

test("the default drag threshold is the drag primitive's stationary travel", () => {
  const { gestures } = tracker();
  assert.equal(
    gestures.dragThresholdPx,
    DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS.stationaryMaxTravelPx,
  );
  assert.throws(() => new PressGestureTracker({ sourceId: "x", dragThresholdPx: -1 }));
});

test("a release below the threshold clicks at the press position", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.move(input(1, 206, 154, 16));
  gestures.release(input(1, 207, 156, 400));

  assert.deepEqual(
    events.map((event) => event.type),
    ["pending", "click"],
  );
  const click = events.at(-1);
  assert.equal(click?.type, "click");
  if (click?.type === "click") {
    assert.deepEqual(click.position, { x: 100, y: 100 });
    assert.equal(click.gesture.button, 2);
    assert.equal(click.stroke.status, "completed");
    assert.equal(click.stroke.samples.length, 3);
  }
  assert.equal(gestures.current(), undefined);
});

test("travel exactly on the threshold stays pending; beyond it starts a drag", () => {
  const { gestures, events } = tracker(10);
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.move(input(1, 210, 150, 16));
  assert.equal(gestures.current()?.phase, "pending");
  gestures.move(input(1, 210.5, 150, 32));
  assert.equal(gestures.current()?.phase, "drag");
  assert.deepEqual(
    events.map((event) => event.type),
    ["pending", "dragStart"],
  );
});

test("threshold jitter cannot turn a latched drag back into a click", () => {
  const { gestures, events } = tracker(10);
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.move(input(1, 209, 150, 10));
  gestures.move(input(1, 211, 150, 20));
  gestures.move(input(1, 209, 150, 30));
  gestures.move(input(1, 200, 150, 40));
  gestures.release(input(1, 200, 150, 50));

  assert.deepEqual(
    events.map((event) => event.type),
    ["pending", "dragStart", "dragMove", "dragMove", "dragEnd"],
  );
  assert.deepEqual(
    outcomes(events).map((event) => event.type),
    ["dragEnd"],
  );
  const end = events.at(-1);
  if (end?.type === "dragEnd") {
    assert.deepEqual(end.total, { x: 0, y: 0 });
  }
});

test("drag deltas are continuous and sum to the total travel", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.move(input(1, 220, 140, 16));
  gestures.move(input(1, 220, 140, 24));
  gestures.move(input(1, 235, 120, 32));
  gestures.release(input(1, 240, 125, 48));

  const drags = events.filter((event) => event.type === "dragStart" || event.type === "dragMove");
  assert.deepEqual(
    drags.map((event) => event.type),
    ["dragStart", "dragMove", "dragMove"],
    "a repeated position emits no zero delta; the release sample moves the drag",
  );
  const sum = drags.reduce(
    (total, event) =>
      event.type === "dragStart" || event.type === "dragMove"
        ? { x: total.x + event.delta.x, y: total.y + event.delta.y }
        : total,
    { x: 0, y: 0 },
  );
  assert.deepEqual(sum, { x: 40, y: -25 });
  const end = events.at(-1);
  assert.equal(end?.type, "dragEnd");
  if (end?.type === "dragEnd") {
    assert.deepEqual(end.total, { x: 40, y: -25 });
    assert.deepEqual(end.position, { x: 140, y: 75 });
  }
});

test("a release sample past the threshold is a drag, never a click", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.release(input(1, 260, 150, 20));
  assert.deepEqual(
    events.map((event) => event.type),
    ["pending", "dragStart", "dragEnd"],
  );
});

test("coalesced samples latch the drag when any sample crosses the threshold", () => {
  const { gestures, events } = tracker(10);
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.move([input(1, 215, 150, 8), input(1, 203, 150, 16)]);
  assert.equal(gestures.current()?.phase, "drag");
  const start = events.at(-1);
  if (start?.type === "dragStart") {
    assert.deepEqual(start.position, { x: 103, y: 100 }, "the event reports the latest sample");
  }
});

for (const phase of ["pending", "drag"] as const) {
  for (const reason of [
    "pointerCancel",
    "lostPointerCapture",
    "blur",
    "hidden",
    "contextChange",
    "detach",
  ] satisfies PointerStrokeCancelReason[]) {
    test(`cancelling while ${phase} (${reason}) produces no command`, () => {
      const { gestures, events } = tracker();
      gestures.press(input(1, 200, 150, 0), surface);
      if (phase === "drag") {
        gestures.move(input(1, 260, 150, 16));
      }
      const cancelled =
        reason === "pointerCancel" || reason === "lostPointerCapture"
          ? gestures.cancelPointer(1, reason)
          : gestures.cancel(reason);
      assert.equal(cancelled.length, 1);
      gestures.move(input(1, 300, 150, 32));
      gestures.release(input(1, 300, 150, 48));

      assert.deepEqual(
        outcomes(events).map((event) => event.type),
        ["cancel"],
      );
      const cancel = outcomes(events)[0];
      if (cancel?.type === "cancel") {
        assert.equal(cancel.reason, reason);
        assert.equal(cancel.gesture.phase, phase);
        assert.equal(cancel.stroke.status, "cancelled");
      }
      assert.equal(gestures.current(), undefined);
    });
  }
}

test("cancelling another pointer leaves the owned gesture untouched", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0), surface);
  assert.deepEqual(gestures.cancelPointer(7, "pointerCancel"), []);
  gestures.release(input(1, 200, 150, 30));
  assert.deepEqual(
    outcomes(events).map((event) => event.type),
    ["click"],
  );
});

test("a single owner ignores other pointers until its gesture ends", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0, "touch"), surface);
  assert.deepEqual(gestures.press(input(2, 300, 200, 4, "touch"), surface), []);
  assert.deepEqual(gestures.move(input(2, 400, 200, 8, "touch")), []);
  assert.deepEqual(gestures.release(input(2, 400, 200, 12, "touch")), []);
  assert.equal(gestures.current()?.pointerId, 1);
  assert.equal(gestures.current()?.phase, "pending");

  gestures.release(input(1, 200, 150, 20, "touch"));
  gestures.press(input(2, 300, 200, 30, "touch"), surface);
  gestures.release(input(2, 300, 200, 40, "touch"));

  assert.deepEqual(
    outcomes(events).map((event) => [event.type, event.gesture.pointerId]),
    [
      ["click", 1],
      ["click", 2],
    ],
  );
});

test("a repeated press by the owner supersedes the stale gesture", () => {
  const { gestures, events } = tracker();
  gestures.press(input(1, 200, 150, 0), surface);
  gestures.press(input(1, 220, 160, 10), surface);
  gestures.release(input(1, 220, 160, 20));

  assert.deepEqual(
    events.map((event) => event.type),
    ["pending", "cancel", "pending", "click"],
  );
  const cancel = events[1];
  if (cancel?.type === "cancel") {
    assert.equal(cancel.reason, "superseded");
  }
});

test("every gesture ends in exactly one outcome across mixed sequences", () => {
  const { gestures, events } = tracker();
  const script: Array<() => void> = [
    () => gestures.press(input(1, 200, 150, 0), surface),
    () => gestures.release(input(1, 200, 150, 10)),
    () => gestures.press(input(1, 200, 150, 20), surface),
    () => gestures.move(input(1, 260, 150, 30)),
    () => gestures.release(input(1, 260, 150, 40)),
    () => gestures.press(input(1, 200, 150, 50), surface),
    () => gestures.cancel("blur"),
    () => gestures.cancel("blur"),
    () => gestures.release(input(1, 200, 150, 60)),
    () => gestures.press(input(1, 200, 150, 70), surface),
    () => gestures.press(input(1, 200, 150, 80), surface),
    () => gestures.cancel("detach"),
  ];
  for (const step of script) {
    step();
  }
  const pending = events.filter((event) => event.type === "pending").map((e) => e.gesture.id);
  const ended = outcomes(events).map((event) => event.gesture.id);
  assert.deepEqual(ended, pending);
  assert.deepEqual(
    outcomes(events).map((event) => event.type),
    ["click", "dragEnd", "cancel", "cancel", "cancel"],
  );
});
