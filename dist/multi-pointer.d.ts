import type { GestureMatch } from "@moritzbrantner/input-bindings";
import type { PointerSampleInput, PointerStrokeCancelReason, PointerSurface } from "./pointer-stroke.js";
type Point = {
    x: number;
    y: number;
};
export type MultiPointerPhase = "start" | "update" | "complete" | "cancel";
export type MultiPointerMode = "pinch" | "rotate" | "pan";
export type MultiPointerMetrics = {
    /** Midpoint of the two pointers in element-local CSS pixels. */
    centroid: Point;
    /** Centroid movement since the session started. */
    translation: {
        dx: number;
        dy: number;
        distance: number;
    };
    /** Current pointer distance divided by the starting distance. */
    scale: number;
    /** Degrees the pointer pair turned since the start; positive is clockwise on screen. */
    rotation: number;
    /** Milliseconds since the second pointer joined. */
    durationMs: number;
};
export type MultiPointerSession = {
    id: string;
    /** The two pointer ids in ascending order; metrics never depend on which arrived first. */
    pointerIds: readonly [number, number];
    status: "active" | "completed" | "cancelled";
    cancelReason?: PointerStrokeCancelReason;
    metrics: MultiPointerMetrics;
    /** Modes currently past their activation threshold (with hysteresis). */
    active: Readonly<Record<MultiPointerMode, boolean>>;
};
export type MultiPointerEvent = {
    phase: MultiPointerPhase;
    session: MultiPointerSession;
};
/**
 * A mode activates when its magnitude reaches `activate` and deactivates only when it falls
 * below `deactivate`, so values hovering at one threshold cannot flicker.
 */
export type MultiPointerHysteresis = {
    activate: number;
    deactivate: number;
};
export type MultiPointerThresholds = {
    /** |ln(scale)|; 0.2 ≈ a 22% distance change. */
    pinch: MultiPointerHysteresis;
    /** |rotation| in degrees. */
    rotate: MultiPointerHysteresis;
    /** Centroid translation in CSS pixels. */
    pan: MultiPointerHysteresis;
};
export declare const DEFAULT_MULTI_POINTER_THRESHOLDS: Readonly<MultiPointerThresholds>;
export type MultiPointerTrackerOptions = {
    sourceId: string;
    thresholds?: Partial<MultiPointerThresholds> | undefined;
    onSession?: ((event: MultiPointerEvent) => void) | undefined;
};
/**
 * Groups exactly two concurrent pointers into one session. Additional pointers are ignored.
 * Lifting either pointer completes the session; cancelling either pointer cancels it.
 */
export declare class MultiPointerTracker {
    private readonly sourceId;
    private readonly thresholds;
    private readonly onSession;
    private readonly waiting;
    private session;
    /** Frozen when the first pointer of a potential pair goes down. */
    private surface;
    private nextSequence;
    constructor(options: MultiPointerTrackerOptions);
    /** Registers a pointer; the second concurrent pointer starts a session. */
    down(input: PointerSampleInput, surface: PointerSurface): MultiPointerEvent | undefined;
    move(input: PointerSampleInput): MultiPointerEvent | undefined;
    /** Lifting either session pointer completes the session with its final metrics. */
    up(input: PointerSampleInput): MultiPointerEvent | undefined;
    /** Cancelling either session pointer cancels the whole session. */
    cancel(pointerId: number, reason: PointerStrokeCancelReason): MultiPointerEvent | undefined;
    cancelAll(reason: PointerStrokeCancelReason): MultiPointerEvent | undefined;
    isTracking(pointerId: number): boolean;
    get hasSession(): boolean;
    private updateActivation;
    private finish;
    private emit;
}
/**
 * Converts a completed session into gesture matches: every mode active at completion, in the
 * fixed order pinch, rotate, two-finger swipe. Cancelled sessions never produce matches.
 */
export declare function recognizeMultiPointerGestures(session: MultiPointerSession): GestureMatch[];
export {};
