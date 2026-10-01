import { resolve } from "./index.js";
/**
 * Expands recognized gestures into the binding patterns they satisfy, most specific first.
 *
 * Recognized gestures arrive ordered by the recognizer (most specific primitive, or best-ranked
 * symbol, first). Each one is followed by its generalization without direction or orientation, so
 * `slash NE` is tried before `slash`, and `slash` before a less specific `swipe`. Duplicates keep
 * their first position.
 */
export function gestureMatchCandidates(recognized) {
    const candidates = [];
    const seen = new Set();
    for (const gesture of recognized) {
        for (const candidate of [gesture, generalizedGesture(gesture)]) {
            if (!candidate) {
                continue;
            }
            const key = JSON.stringify(canonicalGesture(candidate));
            if (!seen.has(key)) {
                seen.add(key);
                candidates.push(canonicalGesture(candidate));
            }
        }
    }
    return candidates;
}
/**
 * Resolves a recognized gesture: the first candidate pattern whose single-stroke resolution is
 * not `none` decides the result, so a more specific bound gesture always wins over a less specific
 * one and ambiguity is reported rather than skipped.
 */
export function resolveGesture(bindings, recognized, activeContexts) {
    return resolveGestureWith(recognized, (candidate) => resolve(bindings, [{ device: "gesture", gesture: candidate }], activeContexts));
}
/** Runs the gesture candidate order against any single-stroke resolver, such as a context stack. */
export function resolveGestureWith(recognized, resolveCandidate) {
    const candidates = gestureMatchCandidates(recognized);
    for (const candidate of candidates) {
        const resolution = resolveCandidate(candidate);
        if (resolution.kind !== "none") {
            return { resolution, matched: candidate, candidates };
        }
    }
    return { resolution: { kind: "none" }, candidates };
}
/** The same gesture without its optional direction or orientation, when it had one. */
export function generalizedGesture(gesture) {
    switch (gesture.kind) {
        case "drag":
        case "swipe":
        case "slash":
        case "pinch":
        case "twoFingerSwipe":
            return gesture.direction ? { kind: gesture.kind } : undefined;
        case "circle":
        case "rotate":
            return gesture.orientation ? { kind: gesture.kind } : undefined;
        case "tap":
        case "hold":
        case "symbol":
            return undefined;
    }
}
function canonicalGesture(gesture) {
    switch (gesture.kind) {
        case "drag":
        case "swipe":
        case "slash":
            return gesture.direction
                ? { kind: gesture.kind, direction: gesture.direction }
                : { kind: gesture.kind };
        case "twoFingerSwipe":
            return gesture.direction
                ? { kind: "twoFingerSwipe", direction: gesture.direction }
                : { kind: "twoFingerSwipe" };
        case "pinch":
            return gesture.direction
                ? { kind: "pinch", direction: gesture.direction }
                : { kind: "pinch" };
        case "circle":
        case "rotate":
            return gesture.orientation
                ? { kind: gesture.kind, orientation: gesture.orientation }
                : { kind: gesture.kind };
        case "tap":
        case "hold":
            return { kind: gesture.kind };
        case "symbol":
            return { kind: "symbol", id: gesture.id };
    }
}
