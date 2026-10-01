import {
  MultiPointerTracker,
  normalizePointerKind,
  recognizeMultiPointerGestures,
  type InputRuntimeController,
  type MultiPointerEvent,
  type MultiPointerSession,
  type MultiPointerThresholds,
  type PointerKind,
  type RuntimeDecision,
  type RuntimeGestureInput,
} from "@moritzbrantner/input-bindings-runtime";

import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.ts";
import {
  pointerEventToSampleInput,
  type PointerStrokeEventLike,
  type PointerStrokeTargetLike,
} from "./pointer-stroke.ts";

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
  onGesture?:
    | ((result: {
        session: MultiPointerSession;
        input: RuntimeGestureInput;
        decision: RuntimeDecision;
      }) => void)
    | undefined;
};

/**
 * Tracks two-pointer sessions on one element. `update` events expose continuous centroid,
 * translation, scale, and rotation for consumer behavior; a completed session's active modes are
 * resolved as pinch/rotate/two-finger-swipe gestures through the runtime controller. A cancelled
 * session never reaches the controller. Returns a detach function.
 */
export function attachMultiPointerGestures(
  controller: InputRuntimeController,
  options: MultiPointerGestureOptions,
): () => void {
  const globals = globalThis as unknown as {
    window?: RuntimeEventTargetLike;
    document?: VisibilityEventTargetLike;
  };
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
      const input: RuntimeGestureInput = {
        matches: recognizeMultiPointerGestures(event.session),
        evidence: { session: event.session },
        ...(options.contexts ? { contexts: options.contexts } : {}),
      };
      const decision = controller.handleGesture(input);
      options.onGesture?.({ session: event.session, input, decision });
    },
  });

  const consume = (event: PointerStrokeEventLike) => {
    if (preventDefault) {
      event.preventDefault?.();
    }
  };

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
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
  const onPointerMove = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    if (tracker.isTracking(event.pointerId)) {
      tracker.move(pointerEventToSampleInput(event));
      consume(event);
    }
  };
  const onPointerUp = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    if (!tracker.isTracking(event.pointerId)) {
      return;
    }
    tracker.up(pointerEventToSampleInput(event));
    if (capturePointer) {
      target.releasePointerCapture?.(event.pointerId);
    }
    consume(event);
  };
  const onPointerCancel = (rawEvent: any) =>
    tracker.cancel((rawEvent as PointerStrokeEventLike).pointerId, "pointerCancel");
  const onLostPointerCapture = (rawEvent: any) =>
    tracker.cancel((rawEvent as PointerStrokeEventLike).pointerId, "lostPointerCapture");
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
