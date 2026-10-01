export type PointerKind = "mouse" | "touch" | "pen" | "unknown";
export type PointerStrokePhase = "start" | "update" | "complete" | "cancel";
export type PointerStrokeStatus = "active" | "completed" | "cancelled";
export type PointerStrokeCancelReason = "pointerCancel" | "lostPointerCapture" | "blur" | "hidden" | "detach" | "superseded" | "reset";
/** Element rectangle in viewport CSS pixels, frozen when a stroke starts. */
export type PointerSurface = {
    left: number;
    top: number;
    width: number;
    height: number;
};
/** One raw pointer observation, as delivered by a Pointer Events adapter or a fixture. */
export type PointerSampleInput = {
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
    timeStamp: number;
    buttons?: number | undefined;
    pressure?: number | undefined;
    tiltX?: number | undefined;
    tiltY?: number | undefined;
};
export type PointerSample = {
    /** Element-local CSS pixels relative to the surface captured at stroke start. */
    x: number;
    y: number;
    /** Original viewport coordinates, retained as debugging evidence. */
    clientX: number;
    clientY: number;
    /** Milliseconds since the first sample of the stroke. Never decreases. */
    t: number;
    /** Milliseconds since the previous sample; 0 for the first sample. */
    dt: number;
    /** Original event timestamp, retained as debugging evidence. */
    timeStamp: number;
    buttons: number;
    pressure?: number;
    tiltX?: number;
    tiltY?: number;
};
export type PointerStroke = {
    /** Stable within one tracker: `${sourceId}:${sequence}`. */
    id: string;
    sourceId: string;
    /** Monotonic per-tracker start order. */
    sequence: number;
    pointerId: number;
    pointerType: PointerKind;
    surface: PointerSurface;
    status: PointerStrokeStatus;
    cancelReason?: PointerStrokeCancelReason;
    /** Grows while the stroke is active; frozen once it completes or cancels. */
    samples: readonly PointerSample[];
};
export type PointerStrokeEvent = {
    phase: PointerStrokePhase;
    stroke: PointerStroke;
};
export type PointerStrokeTrackerOptions = {
    sourceId: string;
    /**
     * Maximum strokes tracked at once. Additional pointers that begin while the limit is reached
     * are ignored rather than displacing an active stroke. Defaults to 1 (single-pointer capture).
     */
    maxActiveStrokes?: number | undefined;
    onStroke?: ((event: PointerStrokeEvent) => void) | undefined;
};
/**
 * Deterministic pointer stroke/session lifecycle. It records normalized samples per pointer and
 * never interprets them; recognizers and consumers read the resulting strokes.
 */
export declare class PointerStrokeTracker {
    private readonly sourceId;
    private readonly maxActiveStrokes;
    private readonly onStroke;
    private readonly active;
    private nextSequence;
    constructor(options: PointerStrokeTrackerOptions);
    /**
     * Starts a stroke. A repeated start for an already active pointer id first cancels the stale
     * stroke as `superseded`, so a missed release cannot strand state.
     */
    begin(input: PointerSampleInput, surface: PointerSurface): PointerStrokeEvent[];
    /** Appends samples to an active stroke. Inputs for untracked pointers are ignored. */
    move(inputs: PointerSampleInput | readonly PointerSampleInput[]): PointerStrokeEvent | undefined;
    /** Completes an active stroke with its release sample. */
    end(input: PointerSampleInput): PointerStrokeEvent | undefined;
    /** Cancels one active stroke without adding a sample. */
    cancel(pointerId: number, reason: PointerStrokeCancelReason): PointerStrokeEvent | undefined;
    /** Cancels every active stroke in start order. */
    cancelAll(reason: PointerStrokeCancelReason): PointerStrokeEvent[];
    isActive(pointerId: number): boolean;
    activeStrokes(): PointerStroke[];
    private finish;
    private emit;
}
export declare function normalizePointerKind(pointerType: string): PointerKind;
