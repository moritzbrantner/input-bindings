import { type PointerKind, type PointerSampleInput, type PointerStrokeEvent } from "@moritzbrantner/input-bindings-runtime";
import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.js";
export type PointerStrokeTargetLike = {
    getBoundingClientRect(): {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    setPointerCapture?(pointerId: number): void;
    releasePointerCapture?(pointerId: number): void;
} & RuntimeEventTargetLike;
export type PointerStrokeEventLike = {
    pointerId: number;
    pointerType: string;
    clientX: number;
    clientY: number;
    timeStamp: number;
    button?: number | undefined;
    buttons?: number | undefined;
    pressure?: number | undefined;
    tiltX?: number | undefined;
    tiltY?: number | undefined;
    getCoalescedEvents?: (() => readonly PointerStrokeEventLike[]) | undefined;
    preventDefault?: (() => void) | undefined;
};
/**
 * `ignore` records only dispatched events. `include` records coalesced samples in the order the
 * browser returns them; the tracker still never lets stroke time run backwards.
 */
export type CoalescedPointerPolicy = "ignore" | "include";
export type PointerStrokeCaptureOptions = {
    target: PointerStrokeTargetLike;
    onStroke: (event: PointerStrokeEvent) => void;
    sourceId?: string | undefined;
    pointerTypes?: readonly PointerKind[] | undefined;
    /** Mouse buttons that may start a stroke. Defaults to the primary button only. */
    mouseButtons?: readonly number[] | undefined;
    coalesced?: CoalescedPointerPolicy | undefined;
    maxActiveStrokes?: number | undefined;
    /**
     * Cancel active strokes as `multiPointer` when another pointer goes down, so a two-pointer
     * adapter on the same element can take over. Defaults to false (the extra pointer is ignored).
     */
    cancelOnAdditionalPointer?: boolean | undefined;
    capturePointer?: boolean | undefined;
    preventDefault?: boolean | undefined;
    focusTarget?: RuntimeEventTargetLike | undefined;
    visibilityTarget?: VisibilityEventTargetLike | undefined;
};
/**
 * Captures mouse, touch, and pen strokes on one element through Pointer Events. The adapter only
 * records stroke lifecycle; it never recognizes gestures or dispatches application actions.
 * Returns a detach function that cancels any active stroke.
 */
export declare function attachPointerStrokeCapture(options: PointerStrokeCaptureOptions): () => void;
export declare function pointerEventToSampleInput(event: PointerStrokeEventLike): PointerSampleInput;
