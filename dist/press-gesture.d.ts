import { type PointerKind, type PointerStrokeCancelReason, type PressGestureEvent } from "@moritzbrantner/input-bindings-runtime";
import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.js";
import { type PointerStrokeTargetLike } from "./pointer-stroke.js";
export type PressGestureCaptureOptions = {
    target: PointerStrokeTargetLike;
    onGesture: (event: PressGestureEvent) => void;
    sourceId?: string | undefined;
    /** The owned button (`PointerEvent.button`). Defaults to 0; touch and pen always report 0. */
    button?: number | undefined;
    /** Defaults to the `drag` gesture primitive's stationary travel threshold. */
    dragThresholdPx?: number | undefined;
    /** Opt-in: stationary releases at or after this duration end in `hold` instead of `click`. */
    holdMinDurationMs?: number | undefined;
    pointerTypes?: readonly PointerKind[] | undefined;
    capturePointer?: boolean | undefined;
    /**
     * Calls `preventDefault` on the pointer events the gesture owns. Defaults to false: a prevented
     * `pointerdown` suppresses compatibility mouse events for every button of that pointer, which
     * would hide other buttons from mouse-event adapters such as `attachMouseRuntime`.
     */
    preventDefault?: boolean | undefined;
    /** Opt-in: suppress the context menu on this surface. Defaults to false. */
    suppressContextMenu?: boolean | undefined;
    focusTarget?: RuntimeEventTargetLike | undefined;
    visibilityTarget?: VisibilityEventTargetLike | undefined;
};
export type PressGestureHandle = {
    /**
     * Cancels the owned gesture without a command, for example when the application changes
     * context. Defaults to `contextChange`.
     */
    cancel(reason?: PointerStrokeCancelReason): void;
    /** Removes listeners and cancels the owned gesture as `detach`. */
    detach(): void;
};
/**
 * Drives a `PressGestureTracker` for one button on one element through Pointer Events. Mouse
 * buttons pressed or released while another button is already down arrive as `pointermove`
 * button transitions; they are recognized here so other buttons and pointers stay unaffected.
 */
export declare function attachPressGesture(options: PressGestureCaptureOptions): PressGestureHandle;
