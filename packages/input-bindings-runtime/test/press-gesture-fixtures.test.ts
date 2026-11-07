import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  PressGestureTracker,
  type PointerSampleInput,
  type PointerStrokeCancelReason,
  type PressGestureEvent,
  type PressGesturePoint,
} from "../src/index.ts";

type Sample = { x: number; y: number; t: number };
type Step =
  | ({ op: "press" | "release"; pointerId: number } & Sample)
  | { op: "move"; pointerId: number; samples: Sample[] }
  | { op: "cancel"; reason: PointerStrokeCancelReason }
  | { op: "cancelPointer"; pointerId: number; reason: PointerStrokeCancelReason };

type FixtureCase = {
  name: string;
  dragThresholdPx?: number;
  holdMinDurationMs?: number;
  steps: Step[];
  expected: string[];
};

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/press-gestures.json", import.meta.url), "utf8"),
) as { cases: FixtureCase[] };

// Surface-local coordinates: the fixture surface sits at the viewport origin.
const surface = { left: 0, top: 0, width: 1000, height: 1000 };

function input(pointerId: number, sample: Sample): PointerSampleInput {
  return {
    pointerId,
    pointerType: "mouse",
    clientX: sample.x,
    clientY: sample.y,
    timeStamp: sample.t,
  };
}

const point = ({ x, y }: PressGesturePoint) => `(${x},${y})`;

/** Mirrors the observation format of `crates/input-bindings-core/tests/press_gesture.rs`. */
function observe(event: PressGestureEvent): string {
  const pointer = `p${event.gesture.pointerId}`;
  switch (event.type) {
    case "pending":
      return `pending ${pointer} at${point(event.gesture.origin)}`;
    case "dragStart":
    case "dragMove":
      return `${event.type} ${pointer} at${point(event.position)} delta${point(event.delta)} total${point(event.total)}`;
    case "dragEnd":
      return `dragEnd ${pointer} at${point(event.position)} total${point(event.total)}`;
    case "click":
      return `click ${pointer} at${point(event.position)}`;
    case "hold":
      return `hold ${pointer} at${point(event.position)} ${event.durationMs}ms`;
    case "cancel":
      return `cancel ${pointer} ${event.gesture.phase} ${event.reason}`;
  }
}

for (const fixtureCase of fixture.cases) {
  test(`press-gesture fixture: ${fixtureCase.name}`, () => {
    const events: PressGestureEvent[] = [];
    const tracker = new PressGestureTracker({
      sourceId: "fixture",
      dragThresholdPx: fixtureCase.dragThresholdPx,
      holdMinDurationMs: fixtureCase.holdMinDurationMs,
      onGesture: (event) => events.push(event),
    });
    for (const step of fixtureCase.steps) {
      switch (step.op) {
        case "press":
          tracker.press(input(step.pointerId, step), surface);
          break;
        case "move":
          tracker.move(step.samples.map((sample) => input(step.pointerId, sample)));
          break;
        case "release":
          tracker.release(input(step.pointerId, step));
          break;
        case "cancel":
          tracker.cancel(step.reason);
          break;
        case "cancelPointer":
          tracker.cancelPointer(step.pointerId, step.reason);
          break;
      }
    }
    assert.deepEqual(events.map(observe), fixtureCase.expected);
    assert.equal(tracker.current(), undefined, "every fixture ends without an owned gesture");
  });
}
