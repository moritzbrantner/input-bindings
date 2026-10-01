import {
  gestureMatchesFromPrimitives,
  recognizeGesturePrimitives,
  type GesturePrimitiveOptions,
  type InputRuntimeController,
  type PointerStroke,
  type PointerStrokeEvent,
  type RuntimeDecision,
  type RuntimeGestureInput,
} from "@moritzbrantner/input-bindings-runtime";

import { attachPointerStrokeCapture, type PointerStrokeCaptureOptions } from "./pointer-stroke.ts";

export type GestureRecognizer = (stroke: PointerStroke) => RuntimeGestureInput;

export type GestureRuntimeAdapterOptions = Omit<PointerStrokeCaptureOptions, "onStroke"> & {
  /** Turns a completed stroke into recognized gestures. Defaults to primitive recognition. */
  recognize?: GestureRecognizer | undefined;
  /** Options for the default primitive recognizer. */
  primitives?: GesturePrimitiveOptions | undefined;
  /** Receives every stroke lifecycle event, including start, update, and cancel. */
  onStroke?: ((event: PointerStrokeEvent) => void) | undefined;
  /** Receives the recognition and the runtime decision for every completed stroke. */
  onGesture?:
    | ((result: {
        stroke: PointerStroke;
        input: RuntimeGestureInput;
        decision: RuntimeDecision;
      }) => void)
    | undefined;
};

/**
 * Feeds completed pointer strokes through recognition into the runtime controller, so gesture
 * bindings resolve through the same context/profile path as every other input. Cancelled strokes
 * never reach recognition. Returns a detach function.
 */
export function attachGestureRuntime(
  controller: InputRuntimeController,
  options: GestureRuntimeAdapterOptions,
): () => void {
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
export function primitiveGestureRecognizer(options?: GesturePrimitiveOptions): GestureRecognizer {
  return (stroke) => {
    const primitives = recognizeGesturePrimitives(stroke, options);
    return {
      matches: gestureMatchesFromPrimitives(primitives.candidates),
      evidence: { strokeId: stroke.id, pointerType: stroke.pointerType, primitives },
    };
  };
}
