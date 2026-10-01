import type { GestureMatch } from "@moritzbrantner/input-bindings";
import type { StrokePoint } from "./gesture-features.js";
import { type GesturePrimitiveKind, type GesturePrimitiveOptions, type GesturePrimitiveRecognition } from "./gesture-primitives.js";
import { type PointerKind, type PointerStroke } from "./pointer-stroke.js";
export declare const GESTURE_TRACE_FORMAT = "input-bindings/gesture-trace";
export declare const GESTURE_TRACE_VERSION = 1;
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
    surface: {
        width: number;
        height: number;
    };
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
export declare function analyzeGestureTrace(trace: Pick<GestureTrace, "samples">, options?: GesturePrimitiveOptions): GestureTraceAnalysis;
/** The regression expectation recorded when a trace is promoted into a fixture. */
export declare function gestureTraceExpectation(analysis: GestureTraceAnalysis): GestureTraceExpectation;
export declare function gestureTraceFromStroke(stroke: PointerStroke, id?: string): GestureTrace;
/** Deterministic JSON with a fixed key order, two-space indentation, and a trailing newline. */
export declare function serializeGestureTrace(trace: GestureTrace): string;
/** Parses and validates a saved trace; throws a descriptive error for anything else. */
export declare function parseGestureTrace(json: string): GestureTrace;
/**
 * Replays a trace at a different presentation size: positions and the surface scale by `factor`,
 * timing is unchanged.
 */
export declare function scaleGestureTrace(trace: GestureTrace, factor: number): GestureTrace;
