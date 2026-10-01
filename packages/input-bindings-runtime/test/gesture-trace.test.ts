import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

import {
  analyzeGestureTrace,
  gestureTraceExpectation,
  gestureTraceFromStroke,
  parseGestureTrace,
  PointerStrokeTracker,
  scaleGestureTrace,
  serializeGestureTrace,
  type GestureTrace,
} from "../src/index.ts";

const traceDirectory = new URL("./fixtures/traces/", import.meta.url);
const fixtures = readdirSync(traceDirectory)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => {
    const text = readFileSync(new URL(file, traceDirectory), "utf8");
    return { file, text, trace: parseGestureTrace(text) };
  });

test("promoted lab traces are byte-stable under the canonical serializer", () => {
  assert.ok(fixtures.length >= 6);
  for (const { file, text, trace } of fixtures) {
    assert.equal(serializeGestureTrace(trace), text, file);
  }
});

test("promoted lab traces replay to their recorded expectation", () => {
  for (const { file, trace } of fixtures) {
    assert.ok(trace.expected, `${file} records an expectation`);
    assert.deepEqual(gestureTraceExpectation(analyzeGestureTrace(trace)), trace.expected, file);
  }
});

test("mouse and touch captures of the same intent replay to the same matches", () => {
  const byId = new Map(fixtures.map(({ trace }) => [trace.id, trace]));
  const mouse = byId.get("slash-ne-mouse");
  const touch = byId.get("slash-ne-touch");
  assert.equal(mouse?.pointerType, "mouse");
  assert.equal(touch?.pointerType, "touch");
  assert.deepEqual(mouse?.expected?.matches, touch?.expected?.matches);
});

test("moving gestures replay identically at other presentation sizes", () => {
  for (const { file, trace } of fixtures) {
    if (trace.expected?.primitives.includes("tap")) {
      // A tap's stationary radius is an absolute pixel tolerance by definition.
      continue;
    }
    for (const factor of [0.75, 1.5]) {
      assert.deepEqual(
        analyzeGestureTrace(scaleGestureTrace(trace, factor)).matches,
        trace.expected?.matches,
        `${file} at ${factor}x`,
      );
    }
  }
});

test("a captured stroke becomes a rounded, origin-relative trace", () => {
  const tracker = new PointerStrokeTracker({ sourceId: "lab" });
  const surface = { left: 10, top: 20, width: 300.123, height: 200 };
  tracker.begin(
    { pointerId: 1, pointerType: "pen", clientX: 10.004, clientY: 20, timeStamp: 1000.04 },
    surface,
  );
  const stroke = tracker.end({
    pointerId: 1,
    pointerType: "pen",
    clientX: 50.556,
    clientY: 30,
    timeStamp: 1016.66,
  })?.stroke;
  assert.ok(stroke);
  assert.deepEqual(gestureTraceFromStroke(stroke, "pen-1"), {
    format: "input-bindings/gesture-trace",
    version: 1,
    id: "pen-1",
    pointerType: "pen",
    surface: { width: 300.12, height: 200 },
    samples: [
      { x: 0, y: 0, t: 0 },
      { x: 40.56, y: 10, t: 16.6 },
    ],
  });
});

test("scaling changes positions and surface but never timing or expectations", () => {
  const trace: GestureTrace = {
    format: "input-bindings/gesture-trace",
    version: 1,
    id: "line",
    pointerType: "mouse",
    surface: { width: 100, height: 50 },
    samples: [
      { x: 10, y: 10, t: 0 },
      { x: 20, y: 10, t: 8 },
    ],
    expected: { primitives: ["drag"], matches: [{ kind: "drag", direction: "E" }] },
  };
  const scaled = scaleGestureTrace(trace, 2);
  assert.deepEqual(scaled.surface, { width: 200, height: 100 });
  assert.deepEqual(scaled.samples, [
    { x: 20, y: 20, t: 0 },
    { x: 40, y: 20, t: 8 },
  ]);
  assert.deepEqual(scaled.expected, trace.expected);
  assert.throws(() => scaleGestureTrace(trace, 0), /positive finite/);
});

test("invalid traces are rejected with a reason", () => {
  const valid = JSON.parse(fixtures[0]?.text ?? "{}") as Record<string, unknown>;
  const cases: Array<[unknown, RegExp]> = [
    [[], /JSON object/],
    [{ ...valid, version: 2 }, /Unsupported gesture trace/],
    [{ ...valid, id: " " }, /id must be/],
    [{ ...valid, surface: { width: "1", height: 1 } }, /surface/],
    [{ ...valid, samples: [] }, /at least one sample/],
    [
      {
        ...valid,
        samples: [
          { x: 0, y: 0, t: 5 },
          { x: 1, y: 0, t: 4 },
        ],
      },
      /back in time/,
    ],
    [{ ...valid, samples: [{ x: 0, y: null, t: 0 }] }, /finite x, y, and t/],
    [{ ...valid, expected: { primitives: [] } }, /expected must list/],
  ];
  for (const [value, message] of cases) {
    assert.throws(() => parseGestureTrace(JSON.stringify(value)), message);
  }
});
