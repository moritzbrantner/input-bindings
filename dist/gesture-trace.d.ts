import type { GestureMatch } from "@moritzbrantner/input-bindings";
import type { StrokePoint, StrokeTrace } from "./gesture-features.js";
import { type GesturePrimitiveKind, type GesturePrimitiveOptions, type GesturePrimitiveRecognition } from "./gesture-primitives.js";
import { type CompiledGestureTemplate, type GestureSymbolOptions, type GestureSymbolRecognition } from "./gesture-templates.js";
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
export type GestureTraceAnalysisOptions = {
    primitives?: GesturePrimitiveOptions | undefined;
    /** Compiled symbol templates. Without templates no symbol recognition runs. */
    templates?: readonly CompiledGestureTemplate[] | undefined;
    symbols?: GestureSymbolOptions | undefined;
};
export type GestureTraceAnalysis = {
    primitives: GesturePrimitiveRecognition;
    symbols?: GestureSymbolRecognition;
    /** Accepted symbols (closest first), then primitives (most specific first). */
    matches: GestureMatch[];
};
/**
 * Recognizes a stroke or a replayed trace without any real-time input. Authored symbols are more
 * specific than primitives, so accepted symbols precede primitive matches.
 */
export declare function analyzeGestureTrace(trace: StrokeTrace, options?: GestureTraceAnalysisOptions): GestureTraceAnalysis;
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
