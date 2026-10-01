import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { resolveGesture, type Binding } from "@moritzbrantner/input-bindings";

import {
  analyzeGestureTrace,
  compileGestureTemplates,
  gestureMatchesFromSymbols,
  recognizeGestureSymbols,
  type GestureTemplate,
  type StrokeTrace,
} from "../src/index.ts";
import { arc, line, transform } from "./gesture-traces.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/gesture-templates.json", import.meta.url), "utf8"),
) as { templates: GestureTemplate[] };
const templates = compileGestureTemplates(fixture.templates);
const authored = new Map(fixture.templates.map((template) => [template.id, template.points]));

/** Draws authored points as a timed stroke, optionally scaled, rotated, reversed, and jittered. */
function draw(
  id: string,
  { scale = 2, dx = 40, dy = 30, rotateDeg = 0, reverse = false, jitter = 0 } = {},
): StrokeTrace {
  const points = [...(authored.get(id) ?? [])];
  if (reverse) {
    points.reverse();
  }
  const radians = (rotateDeg * Math.PI) / 180;
  const dense = points.flatMap((point, index) => {
    const next = points[index + 1];
    if (!next) {
      return [point];
    }
    return Array.from({ length: 12 }, (_, step) => ({
      x: point.x + ((next.x - point.x) * step) / 12,
      y: point.y + ((next.y - point.y) * step) / 12,
    }));
  });
  return {
    samples: dense.map((point, index) => {
      const x = point.x - 50;
      const y = point.y - 50;
      return {
        x:
          (x * Math.cos(radians) - y * Math.sin(radians)) * scale +
          dx +
          jitter * Math.sin(index * 1.7),
        y:
          (x * Math.sin(radians) + y * Math.cos(radians)) * scale +
          dy +
          jitter * Math.cos(index * 2.3),
        t: index * 8,
      };
    }),
  };
}

function top(trace: StrokeTrace) {
  return recognizeGestureSymbols(trace, templates).candidates[0];
}

function candidate(trace: StrokeTrace, id: string) {
  return recognizeGestureSymbols(trace, templates).candidates.find((item) => item.id === id);
}

test("every authored rune recognizes as itself with inspectable evidence", () => {
  for (const id of authored.keys()) {
    const best = top(draw(id));
    assert.equal(best?.id, id);
    assert.equal(best?.accepted, true, id);
    // Invariant templates search rotation to a 2 degree precision, so their self-distance is
    // small but not exactly zero.
    assert.ok((best?.distance ?? 1) < 0.005, id);
    assert.ok((best?.score ?? 0) > 0.95, id);
    assert.deepEqual(best?.provenance, { source: "authored-runes", version: "1" });
  }
});

test("translated and scaled variants produce equivalent recognition", () => {
  for (const id of authored.keys()) {
    const reference = recognizeGestureSymbols(draw(id), templates).candidates;
    for (const variant of [
      { scale: 0.5, dx: 0, dy: 0 },
      { scale: 4, dx: 500, dy: -120 },
    ]) {
      const moved = recognizeGestureSymbols(draw(id, variant), templates).candidates;
      assert.deepEqual(
        moved.map((item) => item.id),
        reference.map((item) => item.id),
        id,
      );
      moved.forEach((item, index) => {
        assert.ok(Math.abs(item.distance - (reference[index]?.distance ?? Number.NaN)) < 1e-9, id);
      });
    }
  }
});

test("rotated variants obey each template's rotation policy", () => {
  const triangle = candidate(draw("triangle", { rotateDeg: 40 }), "triangle");
  assert.equal(triangle?.accepted, true, "invariant templates accept rotation");
  assert.ok(Math.abs(Math.abs(triangle?.rotation ?? 0) - 40) <= 3, "rotation evidence is reported");

  for (const id of ["check", "lightning", "caret"]) {
    const rotated = candidate(draw(id, { rotateDeg: 40 }), id);
    assert.equal(rotated?.accepted, false, `${id} is fixed`);
    assert.equal(rotated?.rotation, 0);
  }
});

test("reversed variants obey each template's direction policy", () => {
  for (const id of ["caret", "triangle"]) {
    const reversed = candidate(draw(id, { reverse: true }), id);
    assert.equal(reversed?.accepted, true, `${id} accepts either direction`);
    assert.equal(reversed?.reversed, true, id);
  }
  for (const id of ["check", "lightning"]) {
    assert.equal(candidate(draw(id, { reverse: true }), id)?.accepted, false, `${id} is directed`);
  }
});

test("hand-drawn noise stays within the acceptance threshold", () => {
  for (const id of authored.keys()) {
    assert.equal(top(draw(id, { jitter: 2 }))?.id, id);
    assert.equal(top(draw(id, { jitter: 2 }))?.accepted, true, id);
  }
});

test("lines, loops, and tiny strokes are not accepted as runes", () => {
  for (const trace of [
    line({ x: 0, y: 0 }, { x: 200, y: 120 }, 200),
    arc({ x: 120, y: 120 }, 80, 0, 360, 600),
  ]) {
    assert.deepEqual(gestureMatchesFromSymbols(recognizeGestureSymbols(trace, templates)), []);
  }
  const tiny = recognizeGestureSymbols(transform(draw("check"), { scale: 0.05 }), templates);
  assert.deepEqual(tiny, { candidates: [], skipped: "tooSmall" });
  assert.equal(
    recognizeGestureSymbols({ samples: [{ x: 1, y: 1, t: 0 }] }, templates).skipped,
    "tooFewSamples",
  );
});

test("equally close templates rank by id rather than registration order", () => {
  const caret = fixture.templates.find((template) => template.id === "caret");
  assert.ok(caret);
  const duplicates = compileGestureTemplates([
    { ...caret, id: "z-caret" },
    { ...caret, id: "a-caret" },
  ]);
  const ranked = recognizeGestureSymbols(draw("caret"), duplicates).candidates;
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["a-caret", "z-caret"],
  );
  assert.equal(ranked[0]?.distance, ranked[1]?.distance);
  assert.deepEqual(gestureMatchesFromSymbols({ candidates: ranked }), [
    { kind: "symbol", id: "a-caret" },
    { kind: "symbol", id: "z-caret" },
  ]);
});

test("recognition is deterministic across repeated runs", () => {
  const trace = draw("lightning", { jitter: 3, rotateDeg: 5 });
  assert.deepEqual(
    recognizeGestureSymbols(trace, templates),
    recognizeGestureSymbols(trace, templates),
  );
});

test("templates are validated when compiled", () => {
  const base = fixture.templates[0];
  assert.ok(base);
  assert.throws(() => compileGestureTemplates([base, base]), /Duplicate gesture template id/);
  assert.throws(() => compileGestureTemplates([{ ...base, id: " " }]), /non-empty/);
  assert.throws(
    () => compileGestureTemplates([{ ...base, points: [{ x: 0, y: 0 }] }]),
    /at least two points/,
  );
  assert.throws(() => compileGestureTemplates([{ ...base, maxDistance: 0 }]), /maxDistance/);
});

test("accepted symbols precede primitives and bind through the normal resolver", () => {
  const analysis = analyzeGestureTrace(draw("triangle"), { templates });
  assert.deepEqual(analysis.matches[0], { kind: "symbol", id: "triangle" });
  assert.ok(
    analysis.matches.some((match) => match.kind === "drag"),
    "primitives still follow",
  );

  const bindings: Binding[] = [
    {
      id: "ward",
      action: "spell.ward",
      sequence: [{ device: "gesture", gesture: { kind: "symbol", id: "triangle" } }],
    },
    {
      id: "drag",
      action: "camera.pan",
      sequence: [{ device: "gesture", gesture: { kind: "drag" } }],
    },
  ];
  assert.deepEqual(resolveGesture(bindings, analysis.matches, new Set()).resolution, {
    kind: "resolved",
    bindingId: "ward",
    action: "spell.ward",
  });
  const unrecognized = analyzeGestureTrace(line({ x: 0, y: 0 }, { x: 200, y: 0 }, 1000), {
    templates,
  });
  assert.deepEqual(resolveGesture(bindings, unrecognized.matches, new Set()).resolution, {
    kind: "resolved",
    bindingId: "drag",
    action: "camera.pan",
  });
});
