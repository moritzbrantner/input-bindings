import { MultiPointerTracker, normalizePointerKind, recognizeMultiPointerGestures, } from "@moritzbrantner/input-bindings-runtime";
import { pointerEventToSampleInput, } from "./pointer-stroke.js";
/**
 * Tracks two-pointer sessions on one element. `update` events expose continuous centroid,
 * translation, scale, and rotation for consumer behavior; a completed session's active modes are
 * resolved as pinch/rotate/two-finger-swipe gestures through the runtime controller. A cancelled
 * session never reaches the controller. Returns a detach function.
 */
export function attachMultiPointerGestures(controller, options) {
    const globals = globalThis;
    const { target } = options;
    const focusTarget = options.focusTarget ?? globals.window;
    const visibilityTarget = options.visibilityTarget ?? globals.document;
    const pointerTypes = new Set(options.pointerTypes ?? ["touch", "pen", "unknown"]);
    const capturePointer = options.capturePointer ?? true;
    const preventDefault = options.preventDefault ?? true;
    const tracker = new MultiPointerTracker({
        sourceId: options.sourceId ?? "multi-pointer",
        thresholds: options.thresholds,
        onSession(event) {
            options.onSession?.(event);
            if (event.phase !== "complete") {
                return;
            }
            const input = {
                matches: recognizeMultiPointerGestures(event.session),
                evidence: { session: event.session },
                ...(options.contexts ? { contexts: options.contexts } : {}),
            };
            const decision = controller.handleGesture(input);
            options.onGesture?.({ session: event.session, input, decision });
        },
    });
    const consume = (event) => {
        if (preventDefault) {
            event.preventDefault?.();
        }
    };
    const onPointerDown = (rawEvent) => {
        const event = rawEvent;
        if (!pointerTypes.has(normalizePointerKind(event.pointerType))) {
            return;
        }
        const rect = target.getBoundingClientRect();
        tracker.down(pointerEventToSampleInput(event), {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        });
        if (tracker.isTracking(event.pointerId)) {
            if (capturePointer) {
                target.setPointerCapture?.(event.pointerId);
            }
            consume(event);
        }
    };
    const onPointerMove = (rawEvent) => {
        const event = rawEvent;
        if (tracker.isTracking(event.pointerId)) {
            tracker.move(pointerEventToSampleInput(event));
            consume(event);
        }
    };
    const onPointerUp = (rawEvent) => {
        const event = rawEvent;
        if (!tracker.isTracking(event.pointerId)) {
            return;
        }
        tracker.up(pointerEventToSampleInput(event));
        if (capturePointer) {
            target.releasePointerCapture?.(event.pointerId);
        }
        consume(event);
    };
    const onPointerCancel = (rawEvent) => tracker.cancel(rawEvent.pointerId, "pointerCancel");
    const onLostPointerCapture = (rawEvent) => tracker.cancel(rawEvent.pointerId, "lostPointerCapture");
    const onBlur = () => tracker.cancelAll("blur");
    const onVisibilityChange = () => {
        if (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden") {
            tracker.cancelAll("hidden");
        }
    };
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);
    target.addEventListener("lostpointercapture", onLostPointerCapture);
    focusTarget?.addEventListener("blur", onBlur);
    visibilityTarget?.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
        target.removeEventListener("pointerdown", onPointerDown);
        target.removeEventListener("pointermove", onPointerMove);
        target.removeEventListener("pointerup", onPointerUp);
        target.removeEventListener("pointercancel", onPointerCancel);
        target.removeEventListener("lostpointercapture", onLostPointerCapture);
        focusTarget?.removeEventListener("blur", onBlur);
        visibilityTarget?.removeEventListener("visibilitychange", onVisibilityChange);
        tracker.cancelAll("detach");
    };
}
