import type { GestureMatch } from "@moritzbrantner/input-bindings";

import type { StrokePoint } from "./gesture-features.ts";
import {
  gestureMatchesFromPrimitives,
  recognizeGesturePrimitives,
  type GesturePrimitiveKind,
  type GesturePrimitiveOptions,
  type GesturePrimitiveRecognition,
} from "./gesture-primitives.ts";
import { normalizePointerKind, type PointerKind, type PointerStroke } from "./pointer-stroke.ts";

export const GESTURE_TRACE_FORMAT = "input-bindings/gesture-trace";
export const GESTURE_TRACE_VERSION = 1;

/**
 * A saved stroke that can be replayed without real-time input. Samples are element-local CSS
 * pixels rounded to 0.01 px and stroke-relative milliseconds rounded to 0.1 ms, so the same trace
 * always serializes to the same bytes.
 */
export type GestureTrace = {
  format: typeof GESTURE_TRACE_FORMAT;
  version: typeof GESTURE_TRACE_VERSION;
  id: string;
  pointerType: PointerKind;
  surface: { width: number; height: number };
  samples: StrokePoint[];
  /** Optional regression expectation, recorded when the trace is promoted into a fixture. */
  expected?: GestureTraceExpectation;
};

export type GestureTraceExpectation = {
  primitives: GesturePrimitiveKind[];
  matches: GestureMatch[];
};

export type GestureTraceAnalysis = {
  primitives: GesturePrimitiveRecognition;
  matches: GestureMatch[];
};

/** Replays a trace through primitive recognition without any real-time input. */
export function analyzeGestureTrace(
  trace: Pick<GestureTrace, "samples">,
  options?: GesturePrimitiveOptions,
): GestureTraceAnalysis {
  const primitives = recognizeGesturePrimitives(trace, options);
  return { primitives, matches: gestureMatchesFromPrimitives(primitives.candidates) };
}

/** The regression expectation recorded when a trace is promoted into a fixture. */
export function gestureTraceExpectation(analysis: GestureTraceAnalysis): GestureTraceExpectation {
  return {
    primitives: analysis.primitives.candidates.map((candidate) => candidate.kind),
    matches: analysis.matches,
  };
}

export function gestureTraceFromStroke(
  stroke: PointerStroke,
  id: string = stroke.id,
): GestureTrace {
  const origin = stroke.samples[0]?.t ?? 0;
  return {
    format: GESTURE_TRACE_FORMAT,
    version: GESTURE_TRACE_VERSION,
    id,
    pointerType: stroke.pointerType,
    surface: { width: round(stroke.surface.width, 100), height: round(stroke.surface.height, 100) },
    samples: stroke.samples.map((sample) => ({
      x: round(sample.x, 100),
      y: round(sample.y, 100),
      t: round(sample.t - origin, 10),
    })),
  };
}

/** Deterministic JSON with a fixed key order, two-space indentation, and a trailing newline. */
export function serializeGestureTrace(trace: GestureTrace): string {
  const ordered: GestureTrace = {
    format: trace.format,
    version: trace.version,
    id: trace.id,
    pointerType: trace.pointerType,
    surface: { width: trace.surface.width, height: trace.surface.height },
    samples: trace.samples.map((sample) => ({ x: sample.x, y: sample.y, t: sample.t })),
    ...(trace.expected
      ? {
          expected: {
            primitives: [...trace.expected.primitives],
            matches: trace.expected.matches.map((match) => ({ ...match })),
          },
        }
      : {}),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/** Parses and validates a saved trace; throws a descriptive error for anything else. */
export function parseGestureTrace(json: string): GestureTrace {
  const value: unknown = JSON.parse(json);
  if (!isRecord(value)) {
    throw new Error("Gesture trace must be a JSON object");
  }
  if (value.format !== GESTURE_TRACE_FORMAT || value.version !== GESTURE_TRACE_VERSION) {
    throw new Error(`Unsupported gesture trace; expected ${GESTURE_TRACE_FORMAT} v1`);
  }
  if (typeof value.id !== "string" || value.id.trim().length === 0) {
    throw new Error("Gesture trace id must be a non-empty string");
  }
  if (typeof value.pointerType !== "string") {
    throw new Error("Gesture trace pointerType must be a string");
  }
  const surface = value.surface;
  if (!isRecord(surface) || !isFiniteNumber(surface.width) || !isFiniteNumber(surface.height)) {
    throw new Error("Gesture trace surface must have finite width and height");
  }
  if (!Array.isArray(value.samples) || value.samples.length === 0) {
    throw new Error("Gesture trace needs at least one sample");
  }
  let previous = Number.NEGATIVE_INFINITY;
  const samples = value.samples.map((sample: unknown, index: number): StrokePoint => {
    if (
      !isRecord(sample) ||
      !isFiniteNumber(sample.x) ||
      !isFiniteNumber(sample.y) ||
      !isFiniteNumber(sample.t)
    ) {
      throw new Error(`Gesture trace sample ${index} must have finite x, y, and t`);
    }
    if (sample.t < previous) {
      throw new Error(`Gesture trace sample ${index} goes back in time`);
    }
    previous = sample.t;
    return { x: sample.x, y: sample.y, t: sample.t };
  });
  const trace: GestureTrace = {
    format: GESTURE_TRACE_FORMAT,
    version: GESTURE_TRACE_VERSION,
    id: value.id,
    pointerType: normalizePointerKind(value.pointerType),
    surface: { width: surface.width, height: surface.height },
    samples,
  };
  if (value.expected !== undefined) {
    if (
      !isRecord(value.expected) ||
      !Array.isArray(value.expected.primitives) ||
      !Array.isArray(value.expected.matches)
    ) {
      throw new Error("Gesture trace expected must list primitives and matches");
    }
    trace.expected = {
      primitives: value.expected.primitives as GesturePrimitiveKind[],
      matches: value.expected.matches as GestureMatch[],
    };
  }
  return trace;
}

/**
 * Replays a trace at a different presentation size: positions and the surface scale by `factor`,
 * timing is unchanged.
 */
export function scaleGestureTrace(trace: GestureTrace, factor: number): GestureTrace {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    throw new Error("Gesture trace scale must be a positive finite number");
  }
  const { expected, ...rest } = trace;
  return {
    ...rest,
    surface: { width: trace.surface.width * factor, height: trace.surface.height * factor },
    samples: trace.samples.map((sample) => ({
      x: sample.x * factor,
      y: sample.y * factor,
      t: sample.t,
    })),
    ...(expected ? { expected } : {}),
  };
}

function round(value: number, precision: number): number {
  const rounded = Math.round(value * precision) / precision;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
