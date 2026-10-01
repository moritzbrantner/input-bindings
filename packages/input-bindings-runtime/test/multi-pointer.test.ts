import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MultiPointerTracker,
  recognizeMultiPointerGestures,
  type MultiPointerEvent,
  type PointerSampleInput,
} from "../src/index.ts";

const surface = { left: 0, top: 0, width: 400, height: 400 };

function input(pointerId: number, clientX: number, clientY: number, timeStamp: number) {
  return {
    pointerId,
    pointerType: "touch",
    clientX,
    clientY,
    timeStamp,
  } satisfies PointerSampleInput;
}

type Pair = { a: [number, number]; b: [number, number] };

/** Runs a two-pointer gesture from `from` to `to` in `steps`, then lifts pointer `liftId`. */
function run(
  from: Pair,
  to: Pair,
  { ids = [1, 2] as [number, number], steps = 8, liftId = ids[0] } = {},
) {
  const events: MultiPointerEvent[] = [];
  const tracker = new MultiPointerTracker({
    sourceId: "pair",
    onSession: (event) => events.push(event),
  });
  tracker.down(input(ids[0], ...from.a, 0), surface);
  tracker.down(input(ids[1], ...from.b, 5), surface);
  for (let step = 1; step <= steps; step += 1) {
    const ratio = step / steps;
    const at = (start: [number, number], end: [number, number]): [number, number] => [
      start[0] + (end[0] - start[0]) * ratio,
      start[1] + (end[1] - start[1]) * ratio,
    ];
    tracker.move(input(ids[0], ...at(from.a, to.a), 5 + step * 16));
    tracker.move(input(ids[1], ...at(from.b, to.b), 5 + step * 16));
  }
  const final = liftId === ids[0] ? to.a : to.b;
  tracker.up(input(liftId, ...final, 5 + steps * 16 + 10));
  return { tracker, events, last: events.at(-1) };
}

test("spreading two pointers is a pinch out with continuous scale evidence", () => {
  const { events, last } = run({ a: [150, 200], b: [250, 200] }, { a: [100, 200], b: [300, 200] });
  assert.deepEqual(
    [...new Set(events.map((event) => event.phase))],
    ["start", "update", "complete"],
  );
  assert.equal(last?.session.metrics.scale, 2);
  assert.deepEqual(last?.session.metrics.centroid, { x: 200, y: 200 });
  assert.equal(last?.session.metrics.durationMs, 138, "measured from when the pair formed");
  assert.ok(last);
  assert.deepEqual(recognizeMultiPointerGestures(last.session), [
    { kind: "pinch", direction: "out" },
  ]);
});

test("closing two pointers is a pinch in", () => {
  const { last } = run({ a: [100, 200], b: [300, 200] }, { a: [160, 200], b: [240, 200] });
  assert.ok(last);
  assert.deepEqual(recognizeMultiPointerGestures(last.session), [
    { kind: "pinch", direction: "in" },
  ]);
});

test("turning the pair is a rotation with screen-clockwise sign", () => {
  const clockwise = run({ a: [100, 200], b: [300, 200] }, { a: [200, 100], b: [200, 300] });
  assert.ok(clockwise.last);
  assert.equal(Math.round(clockwise.last.session.metrics.rotation), 90);
  assert.deepEqual(recognizeMultiPointerGestures(clockwise.last.session), [
    { kind: "rotate", orientation: "clockwise" },
  ]);

  const counter = run({ a: [100, 200], b: [300, 200] }, { a: [200, 300], b: [200, 100] });
  assert.ok(counter.last);
  assert.deepEqual(recognizeMultiPointerGestures(counter.last.session), [
    { kind: "rotate", orientation: "counterClockwise" },
  ]);
});

test("moving the pair together is a two-finger swipe with a compass direction", () => {
  const { last } = run({ a: [100, 300], b: [200, 300] }, { a: [100, 150], b: [200, 150] });
  assert.ok(last);
  assert.deepEqual(last.session.metrics.translation, { dx: 0, dy: -150, distance: 150 });
  assert.deepEqual(recognizeMultiPointerGestures(last.session), [
    { kind: "twoFingerSwipe", direction: "N" },
  ]);
});

test("metrics and recognition do not depend on pointer order or which pointer lifts", () => {
  const from: Pair = { a: [120, 220], b: [260, 180] };
  const to: Pair = { a: [60, 260], b: [330, 120] };
  const forward = run(from, to, { ids: [1, 2] });
  const swapped = run({ a: from.b, b: from.a }, { a: to.b, b: to.a }, { ids: [2, 1], liftId: 1 });
  assert.ok(forward.last && swapped.last);
  assert.deepEqual(forward.last.session.pointerIds, [1, 2]);
  assert.deepEqual(swapped.last.session.pointerIds, [1, 2]);
  assert.deepEqual(forward.last.session.metrics.centroid, swapped.last.session.metrics.centroid);
  assert.equal(forward.last.session.metrics.scale, swapped.last.session.metrics.scale);
  assert.equal(forward.last.session.metrics.rotation, swapped.last.session.metrics.rotation);
  assert.deepEqual(
    recognizeMultiPointerGestures(forward.last.session),
    recognizeMultiPointerGestures(swapped.last.session),
  );
});

test("activation uses hysteresis at explicit threshold boundaries", () => {
  const events: MultiPointerEvent[] = [];
  const tracker = new MultiPointerTracker({
    sourceId: "pair",
    thresholds: { pinch: { activate: Math.log(1.5), deactivate: Math.log(1.2) } },
    onSession: (event) => events.push(event),
  });
  tracker.down(input(1, 100, 200, 0), surface);
  tracker.down(input(2, 200, 200, 0), surface);
  const spread = (x: number, t: number) => tracker.move(input(2, x, 200, t))?.session.active.pinch;

  assert.equal(spread(249, 10), false, "just below activation");
  assert.equal(spread(250, 20), true, "activates exactly at the threshold");
  assert.equal(spread(225, 30), true, "stays active between the thresholds");
  assert.equal(spread(219, 40), false, "deactivates below the lower threshold");
  assert.equal(spread(240, 50), false, "needs the activation threshold again");
});

test("cancelling either pointer cancels the session without matches", () => {
  for (const reason of ["pointerCancel", "lostPointerCapture"] as const) {
    const events: MultiPointerEvent[] = [];
    const tracker = new MultiPointerTracker({
      sourceId: "pair",
      onSession: (event) => events.push(event),
    });
    tracker.down(input(1, 100, 200, 0), surface);
    tracker.down(input(2, 200, 200, 0), surface);
    tracker.move(input(2, 350, 200, 10));
    const cancelled = tracker.cancel(2, reason);
    assert.equal(cancelled?.session.status, "cancelled");
    assert.equal(cancelled?.session.cancelReason, reason);
    assert.deepEqual(recognizeMultiPointerGestures(cancelled!.session), []);
    assert.equal(tracker.hasSession, false);
    assert.equal(tracker.up(input(1, 100, 200, 20)), undefined, "the partner cannot complete it");
  }
});

test("single pointers, extra pointers, and early lifts never form stray sessions", () => {
  const events: MultiPointerEvent[] = [];
  const tracker = new MultiPointerTracker({
    sourceId: "pair",
    onSession: (event) => events.push(event),
  });
  tracker.down(input(1, 100, 200, 0), surface);
  tracker.move(input(1, 150, 200, 10));
  tracker.up(input(1, 150, 200, 20));
  assert.deepEqual(events, [], "one pointer is not a session");

  tracker.down(input(1, 100, 200, 30), surface);
  tracker.down(input(2, 200, 200, 31), surface);
  assert.equal(
    tracker.down(input(3, 300, 200, 32), surface),
    undefined,
    "a third pointer is ignored",
  );
  assert.equal(tracker.isTracking(3), false);
  tracker.cancelAll("blur");
  assert.equal(events.at(-1)?.session.cancelReason, "blur");
  assert.equal(tracker.isTracking(1), false);
});

test("a pair forms from the waiting pointer's current position", () => {
  const tracker = new MultiPointerTracker({ sourceId: "pair" });
  tracker.down(input(1, 100, 200, 0), surface);
  tracker.move(input(1, 50, 200, 10));
  tracker.down(input(2, 250, 200, 20), surface);
  const update = tracker.move(input(2, 250, 200, 30));
  assert.equal(update?.session.metrics.scale, 1, "movement before pairing is not a pinch");
});
