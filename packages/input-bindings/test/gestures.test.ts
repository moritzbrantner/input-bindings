import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  analyzeConflicts,
  gestureMatchCandidates,
  inputDeviceClass,
  inputStrokeEquals,
  resolveGesture,
  resolveGestureWith,
  validateRegistry,
  type ActionRegistry,
  type Binding,
  type Conflict,
  type GestureMatch,
  type GestureResolution,
  type ValidationDiagnostic,
} from "../src/public.ts";

const fixture = JSON.parse(
  readFileSync(new URL("../../../fixtures/gestures.json", import.meta.url), "utf8"),
) as {
  bindings: Binding[];
  resolutionCases: Array<{
    name: string;
    recognized: GestureMatch[];
    activeContexts: string[];
    expected: GestureResolution;
  }>;
  expectedConflicts: Conflict[];
  validation: {
    registry: ActionRegistry;
    expectedDiagnostics: ValidationDiagnostic[];
    expectedEffectiveBindingIds: string[];
  };
};

test("gesture resolution matches the shared fixture", () => {
  for (const entry of fixture.resolutionCases) {
    assert.deepEqual(
      resolveGesture(fixture.bindings, entry.recognized, new Set(entry.activeContexts)),
      entry.expected,
      entry.name,
    );
  }
});

test("gesture conflicts match the shared fixture", () => {
  assert.deepEqual(analyzeConflicts(fixture.bindings), fixture.expectedConflicts);
});

test("gesture validation matches the shared fixture", () => {
  const report = validateRegistry(fixture.validation.registry);
  assert.equal(report.valid, false);
  assert.deepEqual(report.diagnostics, fixture.validation.expectedDiagnostics);
  assert.deepEqual(
    report.effectiveBindings.map((binding) => binding.id),
    fixture.validation.expectedEffectiveBindingIds,
  );
});

test("gesture strokes are pointer-class inputs compared by canonical pattern", () => {
  const slash = { device: "gesture", gesture: { kind: "slash", direction: "NE" } } as const;
  assert.equal(inputDeviceClass(slash), "pointer");
  assert.equal(
    inputStrokeEquals(slash, { device: "gesture", gesture: { kind: "slash", direction: "NE" } }),
    true,
  );
  assert.equal(inputStrokeEquals(slash, { device: "gesture", gesture: { kind: "slash" } }), false);
  assert.equal(
    inputStrokeEquals(
      { device: "gesture", gesture: { kind: "symbol", id: "fire" } },
      { device: "gesture", gesture: { kind: "symbol", id: "water" } },
    ),
    false,
  );
});

test("candidate expansion drops optional parameters explicitly set to undefined", () => {
  assert.deepEqual(
    gestureMatchCandidates([{ kind: "drag", direction: undefined } as unknown as GestureMatch]),
    [{ kind: "drag" }],
  );
});

test("a custom single-stroke resolver sees candidates in specificity order", () => {
  const tried: GestureMatch[] = [];
  const result = resolveGestureWith([{ kind: "circle", orientation: "clockwise" }], (candidate) => {
    tried.push(candidate);
    return { kind: "none" };
  });
  assert.deepEqual(tried, [{ kind: "circle", orientation: "clockwise" }, { kind: "circle" }]);
  assert.deepEqual(result.resolution, { kind: "none" });
  assert.equal(result.matched, undefined);
});
