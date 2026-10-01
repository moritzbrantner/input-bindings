import type { GestureMatch } from "@moritzbrantner/input-bindings";

import { resamplePath, type StrokeTrace } from "./gesture-features.ts";

type Point = { x: number; y: number };

/**
 * `fixed`: the stroke must be drawn at the template's orientation.
 * `invariant`: any rotation is accepted; the best-fitting rotation is reported as evidence.
 */
export type TemplateRotationPolicy = "fixed" | "invariant";
/**
 * `directed`: the stroke must be drawn in the template's order.
 * `either`: drawing it backwards is accepted too; reversal is reported as evidence.
 */
export type TemplateDirectionPolicy = "directed" | "either";

/** A named single-stroke symbol. Application actions do not belong in a template. */
export type GestureTemplate = {
  /** Stable id, bound through `{ kind: "symbol", id }`. */
  id: string;
  /** Authored points in any coordinate scale; normalized when compiled. */
  points: readonly Point[];
  rotation: TemplateRotationPolicy;
  direction: TemplateDirectionPolicy;
  /** Largest accepted mean distance between normalized point sequences (unit: longest side). */
  maxDistance: number;
  provenance: { source: string; version: string };
};

export type CompiledGestureTemplate = Omit<GestureTemplate, "points"> & {
  /** Resampled, centroid-translated, uniformly scaled points (and rotation-normalized if invariant). */
  normalized: readonly Point[];
  /** Radians from the centroid to the first point before rotation normalization. */
  indicativeAngle: number;
};

export type GestureSymbolCandidate = {
  id: string;
  /** Mean distance between normalized point sequences; lower is closer. */
  distance: number;
  /** 1 - distance / maxDistance, clamped to [0, 1]; 0 at the acceptance boundary or beyond. */
  score: number;
  accepted: boolean;
  /**
   * Degrees that rotate the stroke onto an invariant template, in (-180, 180]; positive is
   * clockwise on screen. Always 0 for fixed templates.
   */
  rotation: number;
  /** True when the reversed stroke fitted an `either`-direction template better. */
  reversed: boolean;
  provenance: GestureTemplate["provenance"];
};

export type GestureSymbolRecognition = {
  /** Every template, closest first; ties are ordered by template id, never registration order. */
  candidates: GestureSymbolCandidate[];
  /** Why recognition did not compare the stroke, when it did not. */
  skipped?: "tooSmall" | "tooFewSamples";
};

export type GestureSymbolOptions = {
  /** Strokes whose bounds diagonal is smaller than this are not compared. Defaults to 20 px. */
  minDiagonalPx?: number | undefined;
};

export const TEMPLATE_RESAMPLE_COUNT = 64;
const ROTATION_SEARCH_DEGREES = 45;
const ROTATION_SEARCH_PRECISION_DEGREES = 2;
const GOLDEN_RATIO = (Math.sqrt(5) - 1) / 2;

/** Validates and normalizes templates once so recognition only compares prepared sequences. */
export function compileGestureTemplates(
  templates: readonly GestureTemplate[],
): CompiledGestureTemplate[] {
  const seen = new Set<string>();
  return templates.map((template) => {
    if (!template.id.trim() || /\p{Cc}/u.test(template.id)) {
      throw new Error(`Gesture template ids must be non-empty without control characters`);
    }
    if (seen.has(template.id)) {
      throw new Error(`Duplicate gesture template id: ${template.id}`);
    }
    seen.add(template.id);
    if (template.points.length < 2) {
      throw new Error(`Gesture template ${template.id} needs at least two points`);
    }
    if (!(template.maxDistance > 0) || !Number.isFinite(template.maxDistance)) {
      throw new Error(`Gesture template ${template.id} needs a positive finite maxDistance`);
    }
    const { points, ...rest } = template;
    const { normalized, indicativeAngle } = normalizeTemplatePath(points, template.rotation);
    return { ...rest, normalized, indicativeAngle };
  });
}

/** Compares one stroke against every template and ranks the results deterministically. */
export function recognizeGestureSymbols(
  trace: StrokeTrace,
  templates: readonly CompiledGestureTemplate[],
  options: GestureSymbolOptions = {},
): GestureSymbolRecognition {
  if (trace.samples.length < 2) {
    return { candidates: [], skipped: "tooFewSamples" };
  }
  const xs = trace.samples.map((sample) => sample.x);
  const ys = trace.samples.map((sample) => sample.y);
  const diagonal = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (diagonal < (options.minDiagonalPx ?? 20)) {
    return { candidates: [], skipped: "tooSmall" };
  }

  const forward = {
    fixed: normalizeTemplatePath(trace.samples, "fixed"),
    invariant: normalizeTemplatePath(trace.samples, "invariant"),
  };
  const reversedSamples = [...trace.samples].reverse();
  const backward = {
    fixed: normalizeTemplatePath(reversedSamples, "fixed"),
    invariant: normalizeTemplatePath(reversedSamples, "invariant"),
  };

  const candidates = templates.map((template): GestureSymbolCandidate => {
    const options = [{ points: forward[template.rotation], reversed: false }];
    if (template.direction === "either") {
      options.push({ points: backward[template.rotation], reversed: true });
    }
    let best = { distance: Number.POSITIVE_INFINITY, rotation: 0, reversed: false };
    for (const option of options) {
      let fit = {
        distance: pathDistance(option.points.normalized, template.normalized),
        rotation: 0,
      };
      if (template.rotation === "invariant") {
        const refined = bestRotation(option.points.normalized, template.normalized);
        const radians = template.indicativeAngle - option.points.indicativeAngle + refined.radians;
        fit = { distance: refined.distance, rotation: normalizeDegrees((radians * 180) / Math.PI) };
      }
      if (fit.distance < best.distance) {
        best = { ...fit, reversed: option.reversed };
      }
    }
    return {
      id: template.id,
      distance: best.distance,
      score: Math.min(1, Math.max(0, 1 - best.distance / template.maxDistance)),
      accepted: best.distance <= template.maxDistance,
      rotation: best.rotation,
      reversed: best.reversed,
      provenance: { ...template.provenance },
    };
  });

  candidates.sort((left, right) => left.distance - right.distance || compareIds(left.id, right.id));
  return { candidates };
}

/** Accepted symbols as gesture matches, closest first. */
export function gestureMatchesFromSymbols(recognition: GestureSymbolRecognition): GestureMatch[] {
  return recognition.candidates
    .filter((candidate) => candidate.accepted)
    .map((candidate) => ({ kind: "symbol", id: candidate.id }));
}

function normalizeTemplatePath(
  points: readonly Point[],
  rotation: TemplateRotationPolicy,
): { normalized: Point[]; indicativeAngle: number } {
  let path = resamplePath(points, TEMPLATE_RESAMPLE_COUNT);
  const centroid = centroidOf(path);
  path = path.map((point) => ({ x: point.x - centroid.x, y: point.y - centroid.y }));
  const first = path[0] ?? { x: 0, y: 0 };
  const indicativeAngle = Math.atan2(first.y, first.x);
  if (rotation === "invariant") {
    // Align the indicative angle (centroid to first point) with 0 so rotations compare.
    path = rotatePath(path, -indicativeAngle);
  }
  const xs = path.map((point) => point.x);
  const ys = path.map((point) => point.y);
  const scale = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  return {
    normalized: path.map((point) => ({
      x: scale > 0 ? point.x / scale : 0,
      y: scale > 0 ? point.y / scale : 0,
    })),
    indicativeAngle,
  };
}

/**
 * Golden-section search for the rotation within ±45 degrees of the indicative-angle alignment
 * that minimizes the path distance. Fixed bounds and precision keep it deterministic.
 */
function bestRotation(
  candidate: readonly Point[],
  template: readonly Point[],
): { distance: number; radians: number } {
  const toRadians = Math.PI / 180;
  let low = -ROTATION_SEARCH_DEGREES * toRadians;
  let high = ROTATION_SEARCH_DEGREES * toRadians;
  const precision = ROTATION_SEARCH_PRECISION_DEGREES * toRadians;
  let leftAngle = GOLDEN_RATIO * low + (1 - GOLDEN_RATIO) * high;
  let rightAngle = (1 - GOLDEN_RATIO) * low + GOLDEN_RATIO * high;
  let leftDistance = pathDistance(rotatePath(candidate, leftAngle), template);
  let rightDistance = pathDistance(rotatePath(candidate, rightAngle), template);
  while (Math.abs(high - low) > precision) {
    if (leftDistance < rightDistance) {
      high = rightAngle;
      rightAngle = leftAngle;
      rightDistance = leftDistance;
      leftAngle = GOLDEN_RATIO * low + (1 - GOLDEN_RATIO) * high;
      leftDistance = pathDistance(rotatePath(candidate, leftAngle), template);
    } else {
      low = leftAngle;
      leftAngle = rightAngle;
      leftDistance = rightDistance;
      rightAngle = (1 - GOLDEN_RATIO) * low + GOLDEN_RATIO * high;
      rightDistance = pathDistance(rotatePath(candidate, rightAngle), template);
    }
  }
  return leftDistance <= rightDistance
    ? { distance: leftDistance, radians: leftAngle }
    : { distance: rightDistance, radians: rightAngle };
}

function pathDistance(left: readonly Point[], right: readonly Point[]): number {
  const count = Math.min(left.length, right.length);
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a && b) {
      total += Math.hypot(a.x - b.x, a.y - b.y);
    }
  }
  return count > 0 ? total / count : Number.POSITIVE_INFINITY;
}

function rotatePath(points: readonly Point[], radians: number): Point[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => ({
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  }));
}

function centroidOf(points: readonly Point[]): Point {
  const count = Math.max(1, points.length);
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / count,
    y: points.reduce((sum, point) => sum + point.y, 0) / count,
  };
}

function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  const signed = wrapped > 180 ? wrapped - 360 : wrapped;
  return Math.round(signed * 10) / 10;
}

function compareIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}
