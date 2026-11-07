import {
  normalizePointerKind,
  PressGestureTracker,
  type PointerKind,
  type PointerStrokeCancelReason,
  type PressGestureEvent,
} from "@moritzbrantner/input-bindings-runtime";

import type { RuntimeEventTargetLike, VisibilityEventTargetLike } from "./index.ts";
import {
  pointerEventToSampleInput,
  type PointerStrokeEventLike,
  type PointerStrokeTargetLike,
} from "./pointer-stroke.ts";

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

// PointerEvent.button to PointerEvent.buttons bit; the middle and secondary bits are swapped.
const BUTTON_BITS = [1, 4, 2, 8, 16, 32];

/**
 * Drives a `PressGestureTracker` for one button on one element through Pointer Events. Mouse
 * buttons pressed or released while another button is already down arrive as `pointermove`
 * button transitions; they are recognized here so other buttons and pointers stay unaffected.
 */
export function attachPressGesture(options: PressGestureCaptureOptions): PressGestureHandle {
  const globals = globalThis as unknown as {
    window?: RuntimeEventTargetLike;
    document?: VisibilityEventTargetLike;
  };
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
  const captured = new Set<number>();
  const releaseCapture = (pointerId: number) => {
    if (captured.delete(pointerId)) {
      target.releasePointerCapture?.(pointerId);
    }
  };

  const consume = (event: PointerStrokeEventLike) => {
    if (preventDefault) {
      event.preventDefault?.();
    }
  };

  const accepts = (event: PointerStrokeEventLike) =>
    pointerTypes.has(normalizePointerKind(event.pointerType)) && (event.button ?? 0) === button;

  const press = (event: PointerStrokeEventLike) => {
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

  const release = (event: PointerStrokeEventLike) => {
    // Finish before releasing capture: release may synchronously fire lostpointercapture.
    tracker.release(pointerEventToSampleInput(event));
    // Capture belongs to the pointer, so keep it while another of its buttons is still held.
    if (!event.buttons) {
      releaseCapture(event.pointerId);
    }
    consume(event);
  };

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    if (accepts(event)) {
      press(event);
    }
  };

  const onPointerMove = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
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

  const onPointerUp = (rawEvent: any) => {
    const event = rawEvent as PointerStrokeEventLike;
    if (tracker.owns(event.pointerId)) {
      release(event);
    }
    // The browser releases capture implicitly once every button is up.
    captured.delete(event.pointerId);
  };

  // Browsers release capture implicitly on pointercancel and after lostpointercapture.
  const onPointerCancel = (rawEvent: any) => {
    const { pointerId } = rawEvent as PointerStrokeEventLike;
    captured.delete(pointerId);
    tracker.cancelPointer(pointerId, "pointerCancel");
  };
  const onLostPointerCapture = (rawEvent: any) => {
    const { pointerId } = rawEvent as PointerStrokeEventLike;
    captured.delete(pointerId);
    tracker.cancelPointer(pointerId, "lostPointerCapture");
  };
  const onBlur = () => tracker.cancel("blur");
  const onVisibilityChange = () => {
    if (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden") {
      tracker.cancel("hidden");
    }
  };
  const onContextMenu = (rawEvent: any) => (rawEvent as PointerStrokeEventLike).preventDefault?.();

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
