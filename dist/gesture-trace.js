import { gestureMatchesFromPrimitives, recognizeGesturePrimitives, } from "./gesture-primitives.js";
import { normalizePointerKind } from "./pointer-stroke.js";
export const GESTURE_TRACE_FORMAT = "input-bindings/gesture-trace";
export const GESTURE_TRACE_VERSION = 1;
/** Replays a trace through primitive recognition without any real-time input. */
export function analyzeGestureTrace(trace, options) {
    const primitives = recognizeGesturePrimitives(trace, options);
    return { primitives, matches: gestureMatchesFromPrimitives(primitives.candidates) };
}
/** The regression expectation recorded when a trace is promoted into a fixture. */
export function gestureTraceExpectation(analysis) {
    return {
        primitives: analysis.primitives.candidates.map((candidate) => candidate.kind),
        matches: analysis.matches,
    };
}
export function gestureTraceFromStroke(stroke, id = stroke.id) {
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
export function serializeGestureTrace(trace) {
    const ordered = {
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
export function parseGestureTrace(json) {
    const value = JSON.parse(json);
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
    const samples = value.samples.map((sample, index) => {
        if (!isRecord(sample) ||
            !isFiniteNumber(sample.x) ||
            !isFiniteNumber(sample.y) ||
            !isFiniteNumber(sample.t)) {
            throw new Error(`Gesture trace sample ${index} must have finite x, y, and t`);
        }
        if (sample.t < previous) {
            throw new Error(`Gesture trace sample ${index} goes back in time`);
        }
        previous = sample.t;
        return { x: sample.x, y: sample.y, t: sample.t };
    });
    const trace = {
        format: GESTURE_TRACE_FORMAT,
        version: GESTURE_TRACE_VERSION,
        id: value.id,
        pointerType: normalizePointerKind(value.pointerType),
        surface: { width: surface.width, height: surface.height },
        samples,
    };
    if (value.expected !== undefined) {
        if (!isRecord(value.expected) ||
            !Array.isArray(value.expected.primitives) ||
            !Array.isArray(value.expected.matches)) {
            throw new Error("Gesture trace expected must list primitives and matches");
        }
        trace.expected = {
            primitives: value.expected.primitives,
            matches: value.expected.matches,
        };
    }
    return trace;
}
/**
 * Replays a trace at a different presentation size: positions and the surface scale by `factor`,
 * timing is unchanged.
 */
export function scaleGestureTrace(trace, factor) {
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
function round(value, precision) {
    const rounded = Math.round(value * precision) / precision;
    return Object.is(rounded, -0) ? 0 : rounded;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
