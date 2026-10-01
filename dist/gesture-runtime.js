import { analyzeGestureTrace, } from "@moritzbrantner/input-bindings-runtime";
import { attachPointerStrokeCapture } from "./pointer-stroke.js";
/**
 * Feeds completed pointer strokes through recognition into the runtime controller, so gesture
 * bindings resolve through the same context/profile path as every other input. Cancelled strokes
 * never reach recognition. Returns a detach function.
 */
export function attachGestureRuntime(controller, options) {
    const recognize = options.recognize ?? strokeGestureRecognizer(options.recognition);
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
/** The default recognizer: accepted symbols, then primitives, with the analysis as evidence. */
export function strokeGestureRecognizer(options) {
    return (stroke) => {
        const analysis = analyzeGestureTrace(stroke, options);
        return {
            matches: analysis.matches,
            evidence: { strokeId: stroke.id, pointerType: stroke.pointerType, ...analysis },
        };
    };
}
