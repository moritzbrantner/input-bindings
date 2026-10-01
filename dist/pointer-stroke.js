import { normalizePointerKind, PointerStrokeTracker, } from "@moritzbrantner/input-bindings-runtime";
/**
 * Captures mouse, touch, and pen strokes on one element through Pointer Events. The adapter only
 * records stroke lifecycle; it never recognizes gestures or dispatches application actions.
 * Returns a detach function that cancels any active stroke.
 */
export function attachPointerStrokeCapture(options) {
    const globals = globalThis;
    const { target } = options;
    const focusTarget = options.focusTarget ?? globals.window;
    const visibilityTarget = options.visibilityTarget ?? globals.document;
    const pointerTypes = new Set(options.pointerTypes ?? ["mouse", "touch", "pen", "unknown"]);
    const mouseButtons = new Set(options.mouseButtons ?? [0]);
    const coalesced = options.coalesced ?? "ignore";
    const capturePointer = options.capturePointer ?? true;
    const preventDefault = options.preventDefault ?? true;
    const tracker = new PointerStrokeTracker({
        sourceId: options.sourceId ?? "pointer",
        maxActiveStrokes: options.maxActiveStrokes,
        onStroke: options.onStroke,
    });
    const consume = (event) => {
        if (preventDefault) {
            event.preventDefault?.();
        }
    };
    const onPointerDown = (rawEvent) => {
        const event = rawEvent;
        const kind = normalizePointerKind(event.pointerType);
        if (!pointerTypes.has(kind)) {
            return;
        }
        if (kind === "mouse" && !mouseButtons.has(event.button ?? 0)) {
            return;
        }
        const rect = target.getBoundingClientRect();
        tracker.begin(toInput(event), {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
        });
        if (!tracker.isActive(event.pointerId)) {
            return;
        }
        if (capturePointer) {
            target.setPointerCapture?.(event.pointerId);
        }
        consume(event);
    };
    const onPointerMove = (rawEvent) => {
        const event = rawEvent;
        if (!tracker.isActive(event.pointerId)) {
            return;
        }
        tracker.move(samplesFor(event, coalesced));
        consume(event);
    };
    const onPointerUp = (rawEvent) => {
        const event = rawEvent;
        if (!tracker.isActive(event.pointerId)) {
            return;
        }
        // Finish before releasing capture: release may synchronously fire lostpointercapture.
        tracker.end(toInput(event));
        if (capturePointer) {
            target.releasePointerCapture?.(event.pointerId);
        }
        consume(event);
    };
    // Browsers release capture implicitly on pointercancel and after lostpointercapture.
    const cancelPointer = (rawEvent, reason) => {
        tracker.cancel(rawEvent.pointerId, reason);
    };
    const onPointerCancel = (rawEvent) => cancelPointer(rawEvent, "pointerCancel");
    const onLostPointerCapture = (rawEvent) => cancelPointer(rawEvent, "lostPointerCapture");
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
        for (const event of tracker.cancelAll("detach")) {
            if (capturePointer) {
                target.releasePointerCapture?.(event.stroke.pointerId);
            }
        }
    };
}
export function pointerEventToSampleInput(event) {
    return toInput(event);
}
function samplesFor(event, policy) {
    if (policy === "include") {
        const coalescedEvents = event.getCoalescedEvents?.() ?? [];
        if (coalescedEvents.length > 0) {
            // Coalesced entries are real PointerEvents; read their fields rather than spreading them.
            return coalescedEvents.map((sample) => toInput(sample, event.pointerId));
        }
    }
    return [toInput(event)];
}
function toInput(event, pointerId = event.pointerId) {
    return {
        pointerId,
        pointerType: event.pointerType,
        clientX: event.clientX,
        clientY: event.clientY,
        timeStamp: event.timeStamp,
        buttons: event.buttons,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
    };
}
