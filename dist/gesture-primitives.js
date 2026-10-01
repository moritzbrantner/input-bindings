import { compassDirection, extractStrokeFeatures, } from "./gesture-features.js";
/** Most specific first. Candidates are always reported in this order. */
export const GESTURE_PRIMITIVE_ORDER = [
    "circle",
    "slash",
    "swipe",
    "drag",
    "hold",
    "tap",
];
export const DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS = Object.freeze({
    stationaryMaxTravelPx: 10,
    tapMaxDurationMs: 250,
    holdMinDurationMs: 500,
    swipeMinDistancePx: 40,
    swipeMaxDurationMs: 400,
    swipeMinStraightness: 0.9,
    swipeMinAverageSpeed: 0.3,
    slashMinDistancePx: 80,
    slashMinStraightness: 0.8,
    slashMinPeakSpeed: 0.8,
    circleMinTurningDeg: 300,
    circleMaxClosureRatio: 0.3,
    circleMinAspectRatio: 0.5,
    circleMinDiagonalPx: 40,
    mediumSpeed: 0.3,
    fastSpeed: 1,
});
/**
 * Classifies one completed single-pointer stroke into the primitive vocabulary. Deterministic and
 * pointer-type agnostic; consumers decide what a slash hits or what a circle encloses.
 */
export function recognizeGesturePrimitives(trace, options = {}) {
    const thresholds = { ...DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS, ...options.thresholds };
    const features = extractStrokeFeatures(trace, options.features);
    const candidates = [];
    const stationary = features.maxTravel <= thresholds.stationaryMaxTravelPx;
    const start = features.resampled[0] ?? { x: 0, y: 0 };
    if (!stationary) {
        const circle = circleCandidate(features, thresholds);
        if (circle) {
            candidates.push(circle);
        }
        const directed = directedFields(features, thresholds);
        if (features.displacement.distance >= thresholds.slashMinDistancePx &&
            features.straightness >= thresholds.slashMinStraightness &&
            features.peakSpeed >= thresholds.slashMinPeakSpeed) {
            candidates.push({
                kind: "slash",
                ...directed,
                score: margins([
                    atLeast(features.displacement.distance, thresholds.slashMinDistancePx),
                    atLeast(features.straightness, thresholds.slashMinStraightness),
                    atLeast(features.peakSpeed, thresholds.slashMinPeakSpeed),
                ]),
            });
        }
        if (features.displacement.distance >= thresholds.swipeMinDistancePx &&
            features.durationMs <= thresholds.swipeMaxDurationMs &&
            features.straightness >= thresholds.swipeMinStraightness &&
            features.averageSpeed >= thresholds.swipeMinAverageSpeed) {
            candidates.push({
                kind: "swipe",
                ...directed,
                score: margins([
                    atLeast(features.displacement.distance, thresholds.swipeMinDistancePx),
                    atMost(features.durationMs, thresholds.swipeMaxDurationMs),
                    atLeast(features.straightness, thresholds.swipeMinStraightness),
                    atLeast(features.averageSpeed, thresholds.swipeMinAverageSpeed),
                ]),
            });
        }
        candidates.push({
            kind: "drag",
            ...directed,
            score: margins([
                1 - thresholds.stationaryMaxTravelPx / Math.max(features.maxTravel, Number.EPSILON),
            ]),
        });
    }
    else if (features.durationMs >= thresholds.holdMinDurationMs) {
        candidates.push({
            kind: "hold",
            durationMs: features.durationMs,
            position: start,
            score: margins([
                atMost(features.maxTravel, thresholds.stationaryMaxTravelPx),
                atLeast(features.durationMs, thresholds.holdMinDurationMs),
            ]),
        });
    }
    else if (features.durationMs <= thresholds.tapMaxDurationMs) {
        candidates.push({
            kind: "tap",
            durationMs: features.durationMs,
            position: start,
            score: margins([
                atMost(features.maxTravel, thresholds.stationaryMaxTravelPx),
                atMost(features.durationMs, thresholds.tapMaxDurationMs),
            ]),
        });
    }
    return { features, candidates };
}
export function classifyGestureSpeed(averageSpeed, thresholds = DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS) {
    if (averageSpeed >= thresholds.fastSpeed) {
        return "fast";
    }
    return averageSpeed >= thresholds.mediumSpeed ? "medium" : "slow";
}
function circleCandidate(features, thresholds) {
    if (!features.orientation ||
        features.absoluteTurning < thresholds.circleMinTurningDeg ||
        features.closureRatio > thresholds.circleMaxClosureRatio ||
        features.aspectRatio < thresholds.circleMinAspectRatio ||
        features.diagonal < thresholds.circleMinDiagonalPx) {
        return undefined;
    }
    const points = features.resampled;
    const center = {
        x: features.bounds.minX + features.bounds.width / 2,
        y: features.bounds.minY + features.bounds.height / 2,
    };
    const radius = points.reduce((sum, point) => sum + Math.hypot(point.x - center.x, point.y - center.y), 0) /
        Math.max(1, points.length);
    return {
        kind: "circle",
        orientation: features.orientation,
        turning: features.totalTurning,
        closureRatio: features.closureRatio,
        center,
        radius,
        bounds: features.bounds,
        score: margins([
            atLeast(features.absoluteTurning, thresholds.circleMinTurningDeg),
            atMost(features.closureRatio, thresholds.circleMaxClosureRatio),
            atLeast(features.aspectRatio, thresholds.circleMinAspectRatio),
            atLeast(features.diagonal, thresholds.circleMinDiagonalPx),
        ]),
    };
}
function directedFields(features, thresholds) {
    const angle = features.displacementAngle ?? features.startAngle ?? 0;
    return {
        direction: compassDirection(angle),
        angle,
        distance: features.displacement.distance,
        speedClass: classifyGestureSpeed(features.averageSpeed, thresholds),
        averageSpeed: features.averageSpeed,
        peakSpeed: features.peakSpeed,
    };
}
/** Relative margin of a lower-bounded value: 0 on the threshold, approaching 1 far above it. */
function atLeast(value, minimum) {
    if (minimum <= 0) {
        return 1;
    }
    return value > 0 ? 1 - minimum / value : 0;
}
/** Relative margin of an upper-bounded value: 0 on the threshold, 1 at zero. */
function atMost(value, maximum) {
    return maximum > 0 ? 1 - value / maximum : 0;
}
function margins(values) {
    const clamped = values.map((value) => Math.min(1, Math.max(0, value)));
    return clamped.reduce((sum, value) => sum + value, 0) / Math.max(1, clamped.length);
}
