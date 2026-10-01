import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PointerStrokeTracker,
  type PointerSampleInput,
  type PointerStrokeEvent,
  type PointerSurface,
} from "../src/index.ts";

const surface: PointerSurface = { left: 100, top: 50, width: 200, height: 100 };

function input(
  pointerId: number,
  clientX: number,
  clientY: number,
  timeStamp: number,
  pointerType = "mouse",
): PointerSampleInput {
  return { pointerId, pointerType, clientX, clientY, timeStamp, buttons: 1 };
}

function tracker(events: PointerStrokeEvent[] = [], maxActiveStrokes?: number) {
  return new PointerStrokeTracker({
    sourceId: "surface",
    maxActiveStrokes,
    onStroke: (event) => events.push(event),
  });
}

test("a stroke records element-local samples with monotonic timing through its lifecycle", () => {
  const events: PointerStrokeEvent[] = [];
  const strokes = tracker(events);

  strokes.begin(input(1, 110, 60, 1000), surface);
  strokes.move(input(1, 150, 70, 1016));
  const complete = strokes.end(input(1, 190, 80, 1040));

  assert.deepEqual(
    events.map((event) => event.phase),
    ["start", "update", "complete"],
  );
  assert.equal(complete?.stroke.status, "completed");
  assert.equal(complete?.stroke.id, "surface:1");
  assert.equal(complete?.stroke.pointerType, "mouse");
  assert.deepEqual(
    complete?.stroke.samples.map(({ x, y, t, dt }) => ({ x, y, t, dt })),
    [
      { x: 10, y: 10, t: 0, dt: 0 },
      { x: 50, y: 20, t: 16, dt: 16 },
      { x: 90, y: 30, t: 40, dt: 24 },
    ],
  );
  assert.equal(complete?.stroke.samples[0]?.clientX, 110, "raw viewport evidence is retained");
  assert.ok(Object.isFrozen(complete?.stroke.samples), "finished strokes are immutable");
  assert.equal(strokes.isActive(1), false);
});

test("out-of-order timestamps never move stroke time backwards", () => {
  const strokes = tracker();
  strokes.begin(input(1, 0, 0, 500), surface);
  strokes.move(input(1, 1, 0, 480));
  strokes.move(input(1, 2, 0, 510));
  const complete = strokes.end(input(1, 3, 0, Number.NaN));

  assert.deepEqual(
    complete?.stroke.samples.map(({ t, dt }) => ({ t, dt })),
    [
      { t: 0, dt: 0 },
      { t: 0, dt: 0 },
      { t: 10, dt: 10 },
      { t: 10, dt: 0 },
    ],
  );
});

test("inputs for untracked pointers are ignored", () => {
  const events: PointerStrokeEvent[] = [];
  const strokes = tracker(events);
  assert.equal(strokes.move(input(7, 0, 0, 0)), undefined);
  assert.equal(strokes.end(input(7, 0, 0, 0)), undefined);
  assert.equal(strokes.cancel(7, "pointerCancel"), undefined);
  assert.deepEqual(events, []);
});

test("additional pointers beyond the active limit are ignored instead of displacing a stroke", () => {
  const strokes = tracker();
  strokes.begin(input(1, 0, 0, 0, "touch"), surface);
  assert.deepEqual(strokes.begin(input(2, 5, 5, 1, "touch"), surface), []);
  assert.equal(strokes.isActive(2), false);
  assert.equal(strokes.move(input(2, 9, 9, 2, "touch")), undefined);
  assert.equal(strokes.end(input(1, 3, 3, 3, "touch"))?.stroke.samples.length, 2);
});

test("a repeated start for an active pointer supersedes the stale stroke", () => {
  const events: PointerStrokeEvent[] = [];
  const strokes = tracker(events);
  strokes.begin(input(1, 0, 0, 0), surface);
  const restarted = strokes.begin(input(1, 20, 20, 50), surface);

  assert.deepEqual(
    restarted.map((event) => [event.phase, event.stroke.id, event.stroke.cancelReason]),
    [
      ["cancel", "surface:1", "superseded"],
      ["start", "surface:2", undefined],
    ],
  );
  assert.equal(strokes.activeStrokes().length, 1);
});

test("cancelAll retires every active stroke in start order", () => {
  const events: PointerStrokeEvent[] = [];
  const strokes = tracker(events, 2);
  strokes.begin(input(9, 0, 0, 0, "touch"), surface);
  strokes.begin(input(3, 0, 0, 1, "touch"), surface);
  const cancelled = strokes.cancelAll("blur");

  assert.deepEqual(
    cancelled.map((event) => [
      event.stroke.pointerId,
      event.stroke.status,
      event.stroke.cancelReason,
    ]),
    [
      [9, "cancelled", "blur"],
      [3, "cancelled", "blur"],
    ],
  );
  assert.deepEqual(strokes.activeStrokes(), []);
  assert.deepEqual(strokes.cancelAll("reset"), []);
});

test("comparable mouse and touch paths produce equivalent logical stroke data", () => {
  const record = (pointerType: string) => {
    const strokes = tracker();
    strokes.begin(input(1, 120, 70, 0, pointerType), surface);
    strokes.move(input(1, 160, 90, 10, pointerType));
    return strokes.end(input(1, 200, 110, 20, pointerType))?.stroke;
  };
  const mouse = record("mouse");
  const touch = record("touch");

  assert.equal(mouse?.pointerType, "mouse");
  assert.equal(touch?.pointerType, "touch");
  assert.deepEqual(mouse?.samples, touch?.samples);
});

test("optional pressure and tilt are kept only when the device reports finite values", () => {
  const strokes = tracker();
  strokes.begin(
    { ...input(1, 100, 50, 0, "pen"), pressure: 0.4, tiltX: 12, tiltY: Number.NaN },
    surface,
  );
  const sample = strokes.end(input(1, 100, 50, 5, "pen"))?.stroke.samples[0];
  assert.equal(sample?.pressure, 0.4);
  assert.equal(sample?.tiltX, 12);
  assert.equal("tiltY" in (sample ?? {}), false);
});

test("unknown pointer types are normalized explicitly and empty source ids are rejected", () => {
  const strokes = tracker();
  const [start] = strokes.begin(input(1, 0, 0, 0, "kinect"), surface);
  assert.equal(start?.stroke.pointerType, "unknown");
  assert.throws(() => new PointerStrokeTracker({ sourceId: " " }), /must not be empty/);
});
