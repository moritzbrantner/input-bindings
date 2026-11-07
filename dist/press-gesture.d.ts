import { type PointerKind, type PointerSampleInput, type PointerStroke, type PointerStrokeCancelReason, type PointerSurface } from "./pointer-stroke.js";
export type PressGesturePhase = "pending" | "drag";
export type PressGesturePoint = {
    x: number;
    y: number;
};
export type PressGestureSnapshot = {
    /** The id of the underlying pointer stroke. */
    id: string;
    pointerId: number;
    pointerType: PointerKind;
    button: number;
    phase: PressGesturePhase;
    /** Element-local press position. */
    origin: PressGesturePoint;
};
/**
 * Lifecycle events for one press. Every gesture starts with `pending` and ends with exactly one
 * outcome: `click`, `hold`, `dragEnd`, or `cancel`. A drag never ends in a click or hold.
 */
export type PressGestureEvent = {
    type: "pending";
    gesture: PressGestureSnapshot;
} | {
    type: "dragStart" | "dragMove";
    gesture: PressGestureSnapshot;
    position: PressGesturePoint;
    /** Movement since the previous drag event; `dragStart` measures from the press origin. */
    delta: PressGesturePoint;
    /** Movement since the press origin. */
    total: PressGesturePoint;
} | {
    type: "dragEnd";
    gesture: PressGestureSnapshot;
    position: PressGesturePoint;
    total: PressGesturePoint;
    stroke: PointerStroke;
} | {
    type: "click";
    gesture: PressGestureSnapshot;
    /** The press position, not the release position. */
    position: PressGesturePoint;
    stroke: PointerStroke;
} | {
    /** A stationary press released after `holdMinDurationMs`; only when that option is set. */
    type: "hold";
    gesture: PressGestureSnapshot;
    /** The press position, not the release position. */
    position: PressGesturePoint;
    durationMs: number;
    stroke: PointerStroke;
} | {
    type: "cancel";
    gesture: PressGestureSnapshot;
    reason: PointerStrokeCancelReason;
    stroke: PointerStroke;
};
export type PressGestureTrackerOptions = {
    sourceId: string;
    /** The button this tracker owns, as reported by `PointerEvent.button`. Defaults to 0. */
    button?: number | undefined;
    /**
     * Travel from the press position beyond this distance (CSS pixels) turns the press into a drag.
     * Defaults to the `drag` primitive's `stationaryMaxTravelPx`.
     */
    dragThresholdPx?: number | undefined;
    /**
     * Opt-in: a stationary press released at or after this many milliseconds ends in `hold` instead
     * of `click`. Unset, a stationary release always clicks, however long the press lasted.
     */
    holdMinDurationMs?: number | undefined;
    onGesture?: ((event: PressGestureEvent) => void) | undefined;
};
/**
 * Deterministic press-gesture lifecycle for one button with a single owner: press → pending,
 * crossing the drag threshold → drag with continuous deltas, release below it → click at the press
 * position, and cancellation → no command. Samples are recorded by a `PointerStrokeTracker`, so
 * outcomes carry the same stroke evidence as gesture recognition.
 */
export declare class PressGestureTracker {
    readonly button: number;
    readonly dragThresholdPx: number;
    readonly holdMinDurationMs: number | undefined;
    private readonly strokes;
    private readonly onGesture;
    private active;
    constructor(options: PressGestureTrackerOptions);
    /**
     * Starts a gesture. While another pointer owns the gesture the press is ignored; a repeated
     * press by the owning pointer first cancels the stale gesture as `superseded`.
     */
    press(input: PointerSampleInput, surface: PointerSurface): PressGestureEvent[];
    /** Feeds movement for the owning pointer. Other pointers are ignored. */
    move(inputs: PointerSampleInput | readonly PointerSampleInput[]): PressGestureEvent[];
    /** Ends the owning pointer's gesture with its release sample. */
    release(input: PointerSampleInput): PressGestureEvent[];
    /** Cancels the owned gesture for one pointer; other pointers are unaffected. */
    cancelPointer(pointerId: number, reason: PointerStrokeCancelReason): PressGestureEvent[];
    /** Cancels the owned gesture, if any. A cancelled gesture never produces a click or drag end. */
    cancel(reason: PointerStrokeCancelReason): PressGestureEvent[];
    current(): PressGestureSnapshot | undefined;
    owns(pointerId: number): boolean;
    private finishCancelled;
    private advance;
    private travel;
    private dragEvent;
    private emit;
}
