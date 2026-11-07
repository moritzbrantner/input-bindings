import { normalizePointerKind, PressGestureTracker, } from "@moritzbrantner/input-bindings-runtime";
import { pointerEventToSampleInput, } from "./pointer-stroke.js";
// PointerEvent.button to PointerEvent.buttons bit; the middle and secondary bits are swapped.
const BUTTON_BITS = [1, 4, 2, 8, 16, 32];
/**
 * Drives a `PressGestureTracker` for one button on one element through Pointer Events. Mouse
 * buttons pressed or released while another button is already down arrive as `pointermove`
 * button transitions; they are recognized here so other buttons and pointers stay unaffected.
 */
export function attachPressGesture(options) {
    const globals = globalThis;
    const { target } = options;
    const focusTarget = options.focusTarget ?? globals.window;
    const visibilityTarget = options.visibilityTarget ?? globals.document;
    const pointerTypes = new Set(options.pointerTypes ?? ["mouse", "touch", "pen", "unknown"]);
    const button = options.button ?? 0;
    const bit = BUTTON_BITS[button] ?? 0;
    const capturePointer = options.capturePointer ?? true;
    const preventDefault = options.preventDefault ?? false;
    const tracker = new PressGestureTracker({
        sourceId: options.sourceId ?? "press",
        button,
        dragThresholdPx: options.dragThresholdPx,
        holdMinDurationMs: options.holdMinDurationMs,
        onGesture: options.onGesture,
    });
    // Capture acquired by this adapter, tracked apart from the gesture: a cancelled or finished
    // gesture can still hold capture while another button of the same pointer is down.
    const captured = new Set();
    const releaseCapture = (pointerId) => {
        if (captured.delete(pointerId)) {
            target.releasePointerCapture?.(pointerId);
        }
    };
    const consume = (event) => {
        if (preventDefault) {
            event.preventDefault?.();
        }
    };
    const accepts = (event) => pointerTypes.has(normalizePointerKind(event.pointerType)) && (event.button ?? 0) === button;
    const press = (event) => {
        const rect = target.getBoundingClientRect();
        tracker.press(pointerEventToSampleInput(event), {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        });
        if (!tracker.owns(event.pointerId)) {
            return;
        }
        if (capturePointer) {
            target.setPointerCapture?.(event.pointerId);
            captured.add(event.pointerId);
        }
        consume(event);
    };
    const release = (event) => {
        // Finish before releasing capture: release may synchronously fire lostpointercapture.
        tracker.release(pointerEventToSampleInput(event));
        // Capture belongs to the pointer, so keep it while another of its buttons is still held.
        if (!event.buttons) {
            releaseCapture(event.pointerId);
        }
        consume(event);
    };
    const onPointerDown = (rawEvent) => {
        const event = rawEvent;
        if (accepts(event)) {
            press(event);
        }
    };
    const onPointerMove = (rawEvent) => {
        const event = rawEvent;
        const transition = normalizePointerKind(event.pointerType) === "mouse" && accepts(event);
        if (transition && ((event.buttons ?? 0) & bit) !== 0) {
            if (!tracker.owns(event.pointerId)) {
                press(event);
            }
            return;
        }
        if (!tracker.owns(event.pointerId)) {
            return;
        }
        if (transition) {
            release(event);
            return;
        }
        tracker.move(pointerEventToSampleInput(event));
        consume(event);
    };
    const onPointerUp = (rawEvent) => {
        const event = rawEvent;
        if (tracker.owns(event.pointerId)) {
            release(event);
        }
        // The browser releases capture implicitly once every button is up.
        captured.delete(event.pointerId);
    };
    // Browsers release capture implicitly on pointercancel and after lostpointercapture.
    const onPointerCancel = (rawEvent) => {
        const { pointerId } = rawEvent;
        captured.delete(pointerId);
        tracker.cancelPointer(pointerId, "pointerCancel");
    };
    const onLostPointerCapture = (rawEvent) => {
        const { pointerId } = rawEvent;
        captured.delete(pointerId);
        tracker.cancelPointer(pointerId, "lostPointerCapture");
    };
    const onBlur = () => tracker.cancel("blur");
    const onVisibilityChange = () => {
        if (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden") {
            tracker.cancel("hidden");
        }
    };
    const onContextMenu = (rawEvent) => rawEvent.preventDefault?.();
    target.addEventListener("pointerdown", onPointerDown);
    target.addEventListener("pointermove", onPointerMove);
    target.addEventListener("pointerup", onPointerUp);
    target.addEventListener("pointercancel", onPointerCancel);
    target.addEventListener("lostpointercapture", onLostPointerCapture);
    if (options.suppressContextMenu) {
        target.addEventListener("contextmenu", onContextMenu);
    }
    focusTarget?.addEventListener("blur", onBlur);
    visibilityTarget?.addEventListener("visibilitychange", onVisibilityChange);
    return {
        cancel(reason = "contextChange") {
            tracker.cancel(reason);
        },
        detach() {
            target.removeEventListener("pointerdown", onPointerDown);
            target.removeEventListener("pointermove", onPointerMove);
            target.removeEventListener("pointerup", onPointerUp);
            target.removeEventListener("pointercancel", onPointerCancel);
            target.removeEventListener("lostpointercapture", onLostPointerCapture);
            target.removeEventListener("contextmenu", onContextMenu);
            focusTarget?.removeEventListener("blur", onBlur);
            visibilityTarget?.removeEventListener("visibilitychange", onVisibilityChange);
            tracker.cancel("detach");
            for (const pointerId of [...captured]) {
                releaseCapture(pointerId);
            }
        },
    };
}
