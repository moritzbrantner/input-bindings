import { gestureMatchesFromPrimitives, recognizeGesturePrimitives, } from "@moritzbrantner/input-bindings-runtime";
import { attachPointerStrokeCapture } from "./pointer-stroke.js";
/**
 * Feeds completed pointer strokes through recognition into the runtime controller, so gesture
 * bindings resolve through the same context/profile path as every other input. Cancelled strokes
 * never reach recognition. Returns a detach function.
 */
export function attachGestureRuntime(controller, options) {
    const recognize = options.recognize ?? primitiveGestureRecognizer(options.primitives);
    return attachPointerStrokeCapture({
        ...options,
        onStroke(event) {
            options.onStroke?.(event);
            if (event.phase !== "complete") {
                return;
            }
            const input = recognize(event.stroke);
            const decision = controller.handleGesture(input);
            options.onGesture?.({ stroke: event.stroke, input, decision });
        },
    });
}
/** The default recognizer: primitive candidates, with the recognition as evidence. */
export function primitiveGestureRecognizer(options) {
    return (stroke) => {
        const primitives = recognizeGesturePrimitives(stroke, options);
        return {
            matches: gestureMatchesFromPrimitives(primitives.candidates),
            evidence: { strokeId: stroke.id, pointerType: stroke.pointerType, primitives },
        };
    };
}
