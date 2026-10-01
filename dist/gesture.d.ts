import { type Binding, type GestureMatch, type Resolution } from "./index.js";
/** The outcome of resolving one recognized gesture against single-stroke gesture bindings. */
export type GestureResolution = {
    resolution: Resolution;
    /** The binding pattern that produced `resolution`, when one matched. */
    matched?: GestureMatch;
    /** Every binding pattern tried, in order. */
    candidates: GestureMatch[];
};
/**
 * Expands recognized gestures into the binding patterns they satisfy, most specific first.
 *
 * Recognized gestures arrive ordered by the recognizer (most specific primitive, or best-ranked
 * symbol, first). Each one is followed by its generalization without direction or orientation, so
 * `slash NE` is tried before `slash`, and `slash` before a less specific `swipe`. Duplicates keep
 * their first position.
 */
export declare function gestureMatchCandidates(recognized: readonly GestureMatch[]): GestureMatch[];
/**
 * Resolves a recognized gesture: the first candidate pattern whose single-stroke resolution is
 * not `none` decides the result, so a more specific bound gesture always wins over a less specific
 * one and ambiguity is reported rather than skipped.
 */
export declare function resolveGesture(bindings: readonly Binding[], recognized: readonly GestureMatch[], activeContexts: ReadonlySet<string>): GestureResolution;
/** Runs the gesture candidate order against any single-stroke resolver, such as a context stack. */
export declare function resolveGestureWith(recognized: readonly GestureMatch[], resolveCandidate: (candidate: GestureMatch) => Resolution): GestureResolution;
/** The same gesture without its optional direction or orientation, when it had one. */
export declare function generalizedGesture(gesture: GestureMatch): GestureMatch | undefined;
