import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS as T,
  compassDirection,
  extractStrokeFeatures,
  recognizeGesturePrimitives,
  resamplePath,
  type GesturePrimitiveCandidate,
  type StrokeTrace,
} from "../src/index.ts";
import { arc, decimate, line, stationary, transform } from "./gesture-traces.ts";

function kinds(trace: StrokeTrace) {
  return recognizeGesturePrimitives(trace).candidates.map((candidate) => candidate.kind);
}

function candidate<K extends GesturePrimitiveCandidate["kind"]>(trace: StrokeTrace, kind: K) {
  return recognizeGesturePrimitives(trace).candidates.find(
    (item): item is Extract<GesturePrimitiveCandidate, { kind: K }> => item.kind === kind,
  );
}

test("features describe a straight stroke with explicit metrics", () => {
  const features = extractStrokeFeatures(line({ x: 0, y: 100 }, { x: 120, y: 100 }, 200));
  assert.equal(features.durationMs, 200);
  assert.equal(features.pathLength, 120);
  assert.deepEqual(features.displacement, { dx: 120, dy: 0, distance: 120 });
  assert.equal(features.straightness, 1);
  assert.equal(features.displacementAngle, 0);
  assert.equal(features.startAngle, 0);
  assert.equal(features.averageSpeed, 0.6);
  assert.ok(Math.abs(features.peakSpeed - 0.6) < 1e-9);
  assert.equal(features.absoluteTurning, 0);
  assert.equal(features.orientation, undefined);
  assert.equal(features.resampled.length, 32);
});

test("features never read beyond the provided trace and reject empty strokes", () => {
  assert.throws(() => extractStrokeFeatures({ samples: [] }), /at least one sample/);
  const single = extractStrokeFeatures({ samples: [{ x: 4, y: 5, t: 0 }] });
  assert.equal(single.pathLength, 0);
  assert.equal(single.averageSpeed, 0);
  assert.equal(single.displacementAngle, undefined);
});

test("resampling spaces points evenly and keeps both endpoints", () => {
  const points = resamplePath(
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ],
    5,
  );
  assert.deepEqual(points, [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 10, y: 10 },
  ]);
});

test("compass directions use screen-up north and split at 22.5 degree boundaries", () => {
  assert.equal(compassDirection(0), "E");
  assert.equal(compassDirection(45), "NE");
  assert.equal(compassDirection(90), "N");
  assert.equal(compassDirection(-90), "S");
  assert.equal(compassDirection(22.4), "E");
  assert.equal(compassDirection(22.6), "NE");
  assert.equal(compassDirection(337.6), "E");
});

test("tap and hold are stationary strokes separated by an explicit dead band", () => {
  assert.deepEqual(kinds(stationary(50, 50, T.tapMaxDurationMs)), ["tap"]);
  assert.deepEqual(kinds(stationary(50, 50, T.tapMaxDurationMs + 1)), []);
  assert.deepEqual(kinds(stationary(50, 50, T.holdMinDurationMs - 1)), []);
  assert.deepEqual(kinds(stationary(50, 50, T.holdMinDurationMs)), ["hold"]);

  const jitter = { samples: [...stationary(50, 50, 100).samples, { x: 58, y: 50, t: 120 }] };
  assert.deepEqual(kinds(jitter), ["tap"], "movement inside the stationary radius is a tap");
  const moved = { samples: [...stationary(50, 50, 100).samples, { x: 61, y: 50, t: 120 }] };
  assert.deepEqual(kinds(moved), ["drag"], "movement past the stationary radius is not a tap");
});

test("a fast straight stroke is a directional slash and swipe with evidence", () => {
  const slash = line({ x: 20, y: 220 }, { x: 180, y: 60 }, 120);
  assert.deepEqual(kinds(slash), ["slash", "swipe", "drag"]);
  const evidence = candidate(slash, "slash");
  assert.equal(evidence?.direction, "NE");
  assert.ok(Math.abs((evidence?.angle ?? 0) - 45) < 1e-9);
  assert.equal(evidence?.speedClass, "fast");
  assert.ok((evidence?.score ?? 0) > 0);
});

test("swipes and slashes have explicit near-miss boundaries", () => {
  const slow = line({ x: 0, y: 0 }, { x: 200, y: 0 }, 2000);
  assert.deepEqual(kinds(slow), ["drag"], "slow straight strokes are only drags");

  const tooShort = line({ x: 0, y: 0 }, { x: T.swipeMinDistancePx - 1, y: 0 }, 50);
  assert.deepEqual(kinds(tooShort), ["drag"]);
  const justLongEnough = line({ x: 0, y: 0 }, { x: T.swipeMinDistancePx, y: 0 }, 50);
  assert.deepEqual(kinds(justLongEnough), ["swipe", "drag"]);
  assert.equal(candidate(justLongEnough, "swipe")?.score !== undefined, true);

  const bent = {
    samples: [
      { x: 0, y: 0, t: 0 },
      { x: 60, y: 60, t: 50 },
      { x: 120, y: 0, t: 100 },
    ],
  };
  assert.deepEqual(kinds(bent), ["drag"], "a V-shaped stroke is not straight enough");
});

test("closed loops are circles with reliable orientation", () => {
  const counterClockwise = arc({ x: 150, y: 150 }, 80, 0, 360, 800);
  const clockwise = arc({ x: 150, y: 150 }, 80, 0, -360, 800);

  assert.equal(kinds(counterClockwise)[0], "circle");
  assert.equal(candidate(counterClockwise, "circle")?.orientation, "counterClockwise");
  assert.equal(candidate(clockwise, "circle")?.orientation, "clockwise");

  const evidence = candidate(clockwise, "circle");
  assert.ok(Math.abs((evidence?.center.x ?? 0) - 150) < 1);
  assert.ok(Math.abs((evidence?.center.y ?? 0) - 150) < 1);
  assert.ok(Math.abs((evidence?.radius ?? 0) - 80) < 2);
});

test("open arcs, flat loops, and tiny loops are near-miss circles", () => {
  assert.equal(kinds(arc({ x: 150, y: 150 }, 80, 0, 270, 600)).includes("circle"), false);
  const flat = {
    samples: arc({ x: 150, y: 150 }, 80, 0, 360, 800).samples.map((sample) => ({
      ...sample,
      y: 150 + (sample.y - 150) * 0.3,
    })),
  };
  assert.equal(kinds(flat).includes("circle"), false, "an ellipse flatter than the aspect limit");
  assert.equal(kinds(arc({ x: 50, y: 50 }, 12, 0, 360, 400)).includes("circle"), false);
});

test("recognition is invariant to translation and scale where the definition requires it", () => {
  const loop = arc({ x: 100, y: 100 }, 60, 30, -360, 700);
  const slash = line({ x: 0, y: 0 }, { x: 150, y: 150 }, 100);
  for (const variant of [{ dx: 300, dy: -40 }, { scale: 2.5 }, { scale: 0.8, dx: 17, dy: 9 }]) {
    assert.deepEqual(kinds(transform(loop, variant))[0], "circle");
    assert.equal(candidate(transform(loop, variant), "circle")?.orientation, "clockwise");
    assert.equal(candidate(transform(slash, variant), "slash")?.direction, "SE");
  }
  const base = extractStrokeFeatures(loop).normalized;
  const moved = extractStrokeFeatures(transform(loop, { scale: 3, dx: 40 })).normalized;
  assert.equal(moved.length, base.length);
  moved.forEach((point, index) => {
    assert.ok(Math.abs(point.x - (base[index]?.x ?? Number.NaN)) < 1e-9);
    assert.ok(Math.abs(point.y - (base[index]?.y ?? Number.NaN)) < 1e-9);
  });
});

test("dense mouse-like and sparse touch-like traces of the same intent classify alike", () => {
  const dense = arc({ x: 160, y: 160 }, 90, 90, 360, 900, 120);
  const sparse = decimate(dense, 6);
  assert.deepEqual(kinds(sparse), kinds(dense));
  assert.equal(candidate(sparse, "circle")?.orientation, candidate(dense, "circle")?.orientation);

  const denseSlash = line({ x: 10, y: 10 }, { x: 210, y: 10 }, 150, 60);
  assert.deepEqual(kinds(decimate(denseSlash, 10)), kinds(denseSlash));
});

test("repeated recognition is deterministic", () => {
  const trace = arc({ x: 120, y: 90 }, 70, 10, 350, 650);
  assert.deepEqual(recognizeGesturePrimitives(trace), recognizeGesturePrimitives(trace));
});

test("thresholds are explicit options rather than hidden constants", () => {
  const trace = line({ x: 0, y: 0 }, { x: 60, y: 0 }, 100);
  assert.deepEqual(kinds(trace), ["swipe", "drag"]);
  assert.deepEqual(
    recognizeGesturePrimitives(trace, { thresholds: { slashMinDistancePx: 50 } }).candidates.map(
      (item) => item.kind,
    ),
    ["swipe", "drag"],
    "slash still requires its peak speed",
  );
  assert.deepEqual(
    recognizeGesturePrimitives(trace, {
      thresholds: { slashMinDistancePx: 50, slashMinPeakSpeed: 0.5 },
    }).candidates.map((item) => item.kind),
    ["slash", "swipe", "drag"],
  );
});

test("speed changes the recognized parameters without changing the direction", () => {
  const slow = candidate(line({ x: 0, y: 0 }, { x: 0, y: -200 }, 1000), "drag");
  const fast = candidate(line({ x: 0, y: 0 }, { x: 0, y: -200 }, 100), "slash");
  assert.equal(slow?.direction, "N");
  assert.equal(fast?.direction, "N");
  assert.equal(slow?.speedClass, "slow");
  assert.equal(fast?.speedClass, "fast");
});
