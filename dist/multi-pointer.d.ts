import { type InputRuntimeController, type MultiPointerEvent, type MultiPointerSession, type MultiPointerThresholds, type PointerKind, type RuntimeDecision, type RuntimeGestureInput } from "@moritzbrantner/input-bindings-runtime";
import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.js";
import { type PointerStrokeTargetLike } from "./pointer-stroke.js";
export type MultiPointerGestureOptions = {
    target: PointerStrokeTargetLike;
    sourceId?: string | undefined;
    thresholds?: Partial<MultiPointerThresholds> | undefined;
    /** Pointer types that may join a session. Defaults to touch, pen, and unknown. */
    pointerTypes?: readonly PointerKind[] | undefined;
    capturePointer?: boolean | undefined;
    preventDefault?: boolean | undefined;
    focusTarget?: RuntimeEventTargetLike | undefined;
    visibilityTarget?: VisibilityEventTargetLike | undefined;
    /** Contexts active for gestures from this target only, such as an overlay zone. */
    contexts?: readonly string[] | undefined;
    /** Every session lifecycle event, including continuous `update` metrics. */
    onSession?: ((event: MultiPointerEvent) => void) | undefined;
    onGesture?: ((result: {
        session: MultiPointerSession;
        input: RuntimeGestureInput;
        decision: RuntimeDecision;
    }) => void) | undefined;
};
/**
 * Tracks two-pointer sessions on one element. `update` events expose continuous centroid,
 * translation, scale, and rotation for consumer behavior; a completed session's active modes are
 * resolved as pinch/rotate/two-finger-swipe gestures through the runtime controller. A cancelled
 * session never reaches the controller. Returns a detach function.
 */
export declare function attachMultiPointerGestures(controller: InputRuntimeController, options: MultiPointerGestureOptions): () => void;
