import { type CompassDirection, type StrokeBounds, type StrokeFeatureOptions, type StrokeFeatures, type StrokeOrientation, type StrokeTrace } from "./gesture-features.js";
export type GesturePrimitiveKind = "circle" | "slash" | "swipe" | "drag" | "hold" | "tap";
export type GestureSpeedClass = "slow" | "medium" | "fast";
/** Most specific first. Candidates are always reported in this order. */
export declare const GESTURE_PRIMITIVE_ORDER: readonly GesturePrimitiveKind[];
/**
 * Every threshold is explicit. Distances are CSS pixels, times are milliseconds, speeds are px/ms,
 * angles are degrees, and ratios are unitless.
 */
export type GesturePrimitiveThresholds = {
    /** Movement within this distance of the start still counts as stationary. */
    stationaryMaxTravelPx: number;
    tapMaxDurationMs: number;
    holdMinDurationMs: number;
    swipeMinDistancePx: number;
    swipeMaxDurationMs: number;
    swipeMinStraightness: number;
    swipeMinAverageSpeed: number;
    slashMinDistancePx: number;
    slashMinStraightness: number;
    slashMinPeakSpeed: number;
    circleMinTurningDeg: number;
    circleMaxClosureRatio: number;
    circleMinAspectRatio: number;
    circleMinDiagonalPx: number;
    /** Average speeds at or above this are at least `medium`. */
    mediumSpeed: number;
    /** Average speeds at or above this are `fast`. */
    fastSpeed: number;
};
export declare const DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS: Readonly<GesturePrimitiveThresholds>;
type CandidateBase = {
    /**
     * Mean relative margin past each gating threshold, in [0, 1]. 0 means the stroke sits exactly
     * on a boundary. Scores are evidence; they do not reorder candidates.
     */
    score: number;
};
type DirectedCandidateFields = {
    direction: CompassDirection;
    /** Screen angle in degrees, 0 = east, 90 = north. */
    angle: number;
    distance: number;
    speedClass: GestureSpeedClass;
    averageSpeed: number;
    peakSpeed: number;
};
export type GesturePrimitiveCandidate = (CandidateBase & {
    kind: "circle";
    orientation: StrokeOrientation;
    turning: number;
    closureRatio: number;
    center: {
        x: number;
        y: number;
    };
    radius: number;
    bounds: StrokeBounds;
}) | (CandidateBase & DirectedCandidateFields & {
    kind: "slash";
}) | (CandidateBase & DirectedCandidateFields & {
    kind: "swipe";
}) | (CandidateBase & DirectedCandidateFields & {
    kind: "drag";
}) | (CandidateBase & {
    kind: "hold";
    durationMs: number;
    position: {
        x: number;
        y: number;
    };
}) | (CandidateBase & {
    kind: "tap";
    durationMs: number;
    position: {
        x: number;
        y: number;
    };
});
export type GesturePrimitiveRecognition = {
    features: StrokeFeatures;
    /** Every satisfied primitive, most specific first (see GESTURE_PRIMITIVE_ORDER). */
    candidates: GesturePrimitiveCandidate[];
};
export type GesturePrimitiveOptions = {
    thresholds?: Partial<GesturePrimitiveThresholds> | undefined;
    features?: StrokeFeatureOptions | undefined;
};
/**
 * Classifies one completed single-pointer stroke into the primitive vocabulary. Deterministic and
 * pointer-type agnostic; consumers decide what a slash hits or what a circle encloses.
 */
export declare function recognizeGesturePrimitives(trace: StrokeTrace, options?: GesturePrimitiveOptions): GesturePrimitiveRecognition;
export declare function classifyGestureSpeed(averageSpeed: number, thresholds?: Pick<GesturePrimitiveThresholds, "mediumSpeed" | "fastSpeed">): GestureSpeedClass;
export {};
