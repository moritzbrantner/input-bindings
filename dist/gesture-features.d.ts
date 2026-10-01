import type { CompassDirection, GestureOrientation } from "@moritzbrantner/input-bindings";
export type { CompassDirection } from "@moritzbrantner/input-bindings";
export type StrokeOrientation = GestureOrientation;
/** The minimum stroke evidence features need: element-local CSS pixels and stroke-relative ms. */
export type StrokePoint = {
    x: number;
    y: number;
    t: number;
};
export type StrokeTrace = {
    samples: readonly StrokePoint[];
};
export type StrokeBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
};
export type StrokeFeatures = {
    sampleCount: number;
    durationMs: number;
    /** Straight-line vector from the first to the last sample. */
    displacement: {
        dx: number;
        dy: number;
        distance: number;
    };
    pathLength: number;
    /** Largest distance of any sample from the first sample. */
    maxTravel: number;
    bounds: StrokeBounds;
    /** Bounds diagonal, the scale reference for scale-invariant ratios. */
    diagonal: number;
    /** Short side divided by long side; 0 for a point or a perfectly straight axis-aligned line. */
    aspectRatio: number;
    /** displacement.distance / pathLength; 1 for a straight stroke. */
    straightness: number;
    /** Screen angle in degrees, 0 = east, 90 = north, of the first quarter of the path. */
    startAngle: number | undefined;
    /** Screen angle in degrees of the last quarter of the path. */
    endAngle: number | undefined;
    /** Screen angle in degrees of the overall displacement. */
    displacementAngle: number | undefined;
    /** pathLength / durationMs, in px/ms. */
    averageSpeed: number;
    /** Highest speed over windows of at least `speedWindowMs`, in px/ms. */
    peakSpeed: number;
    /**
     * Signed sum of turning between resampled segments, in degrees. Positive is clockwise on screen
     * (y grows downwards).
     */
    totalTurning: number;
    absoluteTurning: number;
    /** Distance between the first and last sample. */
    closureDistance: number;
    /** closureDistance / diagonal; 0 for a perfectly closed stroke. */
    closureRatio: number;
    /** Orientation of the enclosed area, when the stroke turns enough for it to be meaningful. */
    orientation: StrokeOrientation | undefined;
    /** Equidistant points along the path in element-local pixels. */
    resampled: readonly {
        x: number;
        y: number;
    }[];
    /** `resampled` translated to its centroid and divided by the larger bounds side. */
    normalized: readonly {
        x: number;
        y: number;
    }[];
};
export type StrokeFeatureOptions = {
    /** Number of equidistant points used for shape metrics. Defaults to 32. */
    resampleCount?: number | undefined;
    /** Minimum window for peak speed, so one jittery sample pair cannot dominate. Defaults to 30 ms. */
    speedWindowMs?: number | undefined;
    /** Minimum absolute turning, in degrees, before an orientation is reported. Defaults to 180. */
    orientationMinTurning?: number | undefined;
};
export declare const DEFAULT_RESAMPLE_COUNT = 32;
export declare const DEFAULT_SPEED_WINDOW_MS = 30;
export declare const DEFAULT_ORIENTATION_MIN_TURNING = 180;
/**
 * Derives deterministic, inspectable metrics from a captured stroke. Pure: it reads only the
 * provided samples, never a clock, and never interprets what the stroke means for an application.
 */
export declare function extractStrokeFeatures(trace: StrokeTrace, options?: StrokeFeatureOptions): StrokeFeatures;
/** Maps a screen angle (0 = east, 90 = north) to the nearest of eight compass directions. */
export declare function compassDirection(angleDegrees: number): CompassDirection;
/** Resamples a polyline into `count` points spaced evenly along its length. */
export declare function resamplePath(points: readonly {
    x: number;
    y: number;
}[], count: number): {
    x: number;
    y: number;
}[];
/** Translates points to their centroid and scales by the larger bounds side. */
export declare function normalizePath(points: readonly {
    x: number;
    y: number;
}[]): {
    x: number;
    y: number;
}[];
