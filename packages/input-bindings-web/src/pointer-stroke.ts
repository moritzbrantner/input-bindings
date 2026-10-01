import {
  normalizePointerKind,
  PointerStrokeTracker,
  type PointerKind,
  type PointerSampleInput,
  type PointerStrokeCancelReason,
  type PointerStrokeEvent,
} from "@moritzbrantner/input-bindings-runtime";

import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.ts";

export type PointerStrokeTargetLike = {
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
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
export function attachPointerStrokeCapture(options: PointerStrokeCaptureOptions): () => void {
  const globals = globalThis as unknown as {
    window?: RuntimeEventTargetLike;
    document?: VisibilityEventTargetLike;
  };
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

  const consume = (event: PointerStrokeEventLike) => {
    if (preventDefault) {
      event.preventDefault?.();
    }
  };

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    const kind = normalizePointerKind(event.pointerType);
    if (!pointerTypes.has(kind)) {
      return;
    }
    if (kind === "mouse" && !mouseButtons.has(event.button ?? 0)) {
      return;
    }
    if (options.cancelOnAdditionalPointer && tracker.activeStrokes().length > 0) {
      if (!tracker.isActive(event.pointerId)) {
        tracker.cancelAll("multiPointer");
        return;
      }
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

  const onPointerMove = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    if (!tracker.isActive(event.pointerId)) {
      return;
    }
    tracker.move(samplesFor(event, coalesced));
    consume(event);
  };

  const onPointerUp = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
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
  const cancelPointer = (rawEvent: any, reason: PointerStrokeCancelReason) => {
    tracker.cancel((rawEvent as PointerStrokeEventLike).pointerId, reason);
  };
  const onPointerCancel = (rawEvent: any) => cancelPointer(rawEvent, "pointerCancel");
  const onLostPointerCapture = (rawEvent: any) => cancelPointer(rawEvent, "lostPointerCapture");
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

export function pointerEventToSampleInput(event: PointerStrokeEventLike): PointerSampleInput {
  return toInput(event);
}

function samplesFor(
  event: PointerStrokeEventLike,
  policy: CoalescedPointerPolicy,
): PointerSampleInput[] {
  if (policy === "include") {
    const coalescedEvents = event.getCoalescedEvents?.() ?? [];
    if (coalescedEvents.length > 0) {
      // Coalesced entries are real PointerEvents; read their fields rather than spreading them.
      return coalescedEvents.map((sample) => toInput(sample, event.pointerId));
    }
  }
  return [toInput(event)];
}

function toInput(
  event: PointerStrokeEventLike,
  pointerId: number = event.pointerId,
): PointerSampleInput {
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
