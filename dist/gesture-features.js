export const DEFAULT_RESAMPLE_COUNT = 32;
export const DEFAULT_SPEED_WINDOW_MS = 30;
export const DEFAULT_ORIENTATION_MIN_TURNING = 180;
/**
 * Derives deterministic, inspectable metrics from a captured stroke. Pure: it reads only the
 * provided samples, never a clock, and never interprets what the stroke means for an application.
 */
export function extractStrokeFeatures(trace, options = {}) {
    const samples = trace.samples;
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last) {
        throw new Error("Stroke features require at least one sample");
    }
    const resampleCount = Math.max(2, Math.floor(options.resampleCount ?? DEFAULT_RESAMPLE_COUNT));
    const speedWindowMs = Math.max(0, options.speedWindowMs ?? DEFAULT_SPEED_WINDOW_MS);
    const orientationMinTurning = options.orientationMinTurning ?? DEFAULT_ORIENTATION_MIN_TURNING;
    const bounds = strokeBounds(samples);
    const diagonal = Math.hypot(bounds.width, bounds.height);
    const pathLength = polylineLength(samples);
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const distance = Math.hypot(dx, dy);
    const durationMs = Math.max(0, last.t - first.t);
    const resampled = resamplePath(samples, resampleCount);
    const turning = signedTurning(resampled);
    const quarter = Math.max(1, Math.floor((resampled.length - 1) / 4));
    const longSide = Math.max(bounds.width, bounds.height);
    return {
        sampleCount: samples.length,
        durationMs,
        displacement: { dx, dy, distance },
        pathLength,
        maxTravel: Math.max(...samples.map((sample) => Math.hypot(sample.x - first.x, sample.y - first.y))),
        bounds,
        diagonal,
        aspectRatio: longSide > 0 ? Math.min(bounds.width, bounds.height) / longSide : 0,
        straightness: pathLength > 0 ? distance / pathLength : 1,
        startAngle: segmentAngle(resampled[0], resampled[quarter]),
        endAngle: segmentAngle(resampled[resampled.length - 1 - quarter], resampled.at(-1)),
        displacementAngle: segmentAngle(first, last),
        averageSpeed: durationMs > 0 ? pathLength / durationMs : 0,
        peakSpeed: peakSpeed(samples, speedWindowMs),
        totalTurning: turning,
        absoluteTurning: Math.abs(turning),
        closureDistance: distance,
        closureRatio: diagonal > 0 ? distance / diagonal : 0,
        orientation: turningOrientation(turning, orientationMinTurning),
        resampled,
        normalized: normalizePath(resampled),
    };
}
/** Maps a screen angle (0 = east, 90 = north) to the nearest of eight compass directions. */
export function compassDirection(angleDegrees) {
    const directions = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
    const index = Math.round(normalizeDegrees(angleDegrees) / 45) % 8;
    return directions[index] ?? "E";
}
/** Resamples a polyline into `count` points spaced evenly along its length. */
export function resamplePath(points, count) {
    const first = points[0];
    if (!first) {
        return [];
    }
    const total = polylineLength(points);
    if (total === 0 || count < 2) {
        return Array.from({ length: Math.max(1, count) }, () => ({ x: first.x, y: first.y }));
    }
    const step = total / (count - 1);
    const result = [{ x: first.x, y: first.y }];
    let previous = { x: first.x, y: first.y };
    let accumulated = 0;
    for (const point of points.slice(1)) {
        let segment = Math.hypot(point.x - previous.x, point.y - previous.y);
        while (segment > 0 && accumulated + segment >= step && result.length < count - 1) {
            const ratio = (step - accumulated) / segment;
            previous = {
                x: previous.x + (point.x - previous.x) * ratio,
                y: previous.y + (point.y - previous.y) * ratio,
            };
            result.push(previous);
            segment = Math.hypot(point.x - previous.x, point.y - previous.y);
            accumulated = 0;
        }
        accumulated += segment;
        previous = { x: point.x, y: point.y };
    }
    const last = points.at(-1) ?? first;
    while (result.length < count) {
        result.push({ x: last.x, y: last.y });
    }
    return result;
}
/** Translates points to their centroid and scales by the larger bounds side. */
export function normalizePath(points) {
    if (points.length === 0) {
        return [];
    }
    const centroid = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    };
    const bounds = strokeBounds(points);
    const scale = Math.max(bounds.width, bounds.height);
    return points.map((point) => ({
        x: scale > 0 ? (point.x - centroid.x) / scale : 0,
        y: scale > 0 ? (point.y - centroid.y) / scale : 0,
    }));
}
function strokeBounds(points) {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
function polylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (from && to) {
            length += Math.hypot(to.x - from.x, to.y - from.y);
        }
    }
    return length;
}
function segmentAngle(from, to) {
    if (!from || !to || (from.x === to.x && from.y === to.y)) {
        return undefined;
    }
    // Screen y grows downwards; flip it so 90 degrees points up.
    return normalizeDegrees((Math.atan2(from.y - to.y, to.x - from.x) * 180) / Math.PI);
}
function signedTurning(points) {
    let total = 0;
    let previous;
    for (let index = 1; index < points.length; index += 1) {
        const from = points[index - 1];
        const to = points[index];
        if (!from || !to || (from.x === to.x && from.y === to.y)) {
            continue;
        }
        // Raw screen-space heading: positive turning is clockwise as seen on screen.
        const heading = Math.atan2(to.y - from.y, to.x - from.x);
        if (previous !== undefined) {
            let delta = heading - previous;
            if (delta > Math.PI) {
                delta -= 2 * Math.PI;
            }
            else if (delta < -Math.PI) {
                delta += 2 * Math.PI;
            }
            total += delta;
        }
        previous = heading;
    }
    return (total * 180) / Math.PI;
}
/**
 * For each sample, measures path speed over the shortest preceding window spanning at least
 * `windowMs`, and returns the highest. Strokes shorter than the window use their whole duration.
 */
function peakSpeed(samples, windowMs) {
    const first = samples[0];
    const last = samples.at(-1);
    if (!first || !last || last.t <= first.t) {
        return 0;
    }
    if (last.t - first.t < windowMs) {
        return polylineLength(samples) / (last.t - first.t);
    }
    let peak = 0;
    for (let end = 1; end < samples.length; end += 1) {
        const to = samples[end];
        if (!to) {
            continue;
        }
        let distance = 0;
        for (let index = end; index > 0; index -= 1) {
            const current = samples[index];
            const before = samples[index - 1];
            if (!current || !before) {
                break;
            }
            distance += Math.hypot(current.x - before.x, current.y - before.y);
            const elapsed = to.t - before.t;
            if (elapsed >= windowMs) {
                peak = Math.max(peak, distance / elapsed);
                break;
            }
        }
    }
    return peak;
}
function turningOrientation(turning, minTurning) {
    if (Math.abs(turning) < minTurning) {
        return undefined;
    }
    return turning > 0 ? "clockwise" : "counterClockwise";
}
function normalizeDegrees(angle) {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
}
