import { DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS } from "./gesture-primitives.ts";
import {
  PointerStrokeTracker,
  type PointerKind,
  type PointerSampleInput,
  type PointerStroke,
  type PointerStrokeCancelReason,
  type PointerStrokeEvent,
  type PointerSurface,
} from "./pointer-stroke.ts";

export type PressGesturePhase = "pending" | "drag";

export type PressGesturePoint = { x: number; y: number };

export type PressGestureSnapshot = {
  /** The id of the underlying pointer stroke. */
  id: string;
  pointerId: number;
  pointerType: PointerKind;
  button: number;
  phase: PressGesturePhase;
  /** Element-local press position. */
  origin: PressGesturePoint;
};

/**
 * Lifecycle events for one press. Every gesture starts with `pending` and ends with exactly one
 * outcome: `click`, `dragEnd`, or `cancel`. A drag never ends in a click.
 */
export type PressGestureEvent =
  | { type: "pending"; gesture: PressGestureSnapshot }
  | {
      type: "dragStart" | "dragMove";
      gesture: PressGestureSnapshot;
      position: PressGesturePoint;
      /** Movement since the previous drag event; `dragStart` measures from the press origin. */
      delta: PressGesturePoint;
      /** Movement since the press origin. */
      total: PressGesturePoint;
    }
  | {
      type: "dragEnd";
      gesture: PressGestureSnapshot;
      position: PressGesturePoint;
      total: PressGesturePoint;
      stroke: PointerStroke;
    }
  | {
      type: "click";
      gesture: PressGestureSnapshot;
      /** The press position, not the release position. */
      position: PressGesturePoint;
      stroke: PointerStroke;
    }
  | {
      type: "cancel";
      gesture: PressGestureSnapshot;
      reason: PointerStrokeCancelReason;
      stroke: PointerStroke;
    };

export type PressGestureTrackerOptions = {
  sourceId: string;
  /** The button this tracker owns, as reported by `PointerEvent.button`. Defaults to 0. */
  button?: number | undefined;
  /**
   * Travel from the press position beyond this distance (CSS pixels) turns the press into a drag.
   * Defaults to the `drag` primitive's `stationaryMaxTravelPx`.
   */
  dragThresholdPx?: number | undefined;
  onGesture?: ((event: PressGestureEvent) => void) | undefined;
};

type ActiveGesture = {
  gesture: PressGestureSnapshot;
  last: PressGesturePoint;
};

/**
 * Deterministic press-gesture lifecycle for one button with a single owner: press → pending,
 * crossing the drag threshold → drag with continuous deltas, release below it → click at the press
 * position, and cancellation → no command. Samples are recorded by a `PointerStrokeTracker`, so
 * outcomes carry the same stroke evidence as gesture recognition.
 */
export class PressGestureTracker {
  readonly button: number;
  readonly dragThresholdPx: number;
  private readonly strokes: PointerStrokeTracker;
  private readonly onGesture: ((event: PressGestureEvent) => void) | undefined;
  private active: ActiveGesture | undefined;

  constructor(options: PressGestureTrackerOptions) {
    this.button = options.button ?? 0;
    this.dragThresholdPx =
      options.dragThresholdPx ?? DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS.stationaryMaxTravelPx;
    if (!Number.isFinite(this.dragThresholdPx) || this.dragThresholdPx < 0) {
      throw new Error("Press gesture drag thresholds must be finite and non-negative");
    }
    this.strokes = new PointerStrokeTracker({ sourceId: options.sourceId, maxActiveStrokes: 1 });
    this.onGesture = options.onGesture;
  }

  /**
   * Starts a gesture. While another pointer owns the gesture the press is ignored; a repeated
   * press by the owning pointer first cancels the stale gesture as `superseded`.
   */
  press(input: PointerSampleInput, surface: PointerSurface): PressGestureEvent[] {
    if (this.active && this.active.gesture.pointerId !== input.pointerId) {
      return [];
    }
    const events: PressGestureEvent[] = [];
    for (const strokeEvent of this.strokes.begin(input, surface)) {
      if (strokeEvent.phase === "cancel") {
        events.push(...this.finishCancelled(strokeEvent));
        continue;
      }
      const origin = strokeEvent.stroke.samples[0] ?? { x: 0, y: 0 };
      const gesture: PressGestureSnapshot = {
        id: strokeEvent.stroke.id,
        pointerId: strokeEvent.stroke.pointerId,
        pointerType: strokeEvent.stroke.pointerType,
        button: this.button,
        phase: "pending",
        origin: { x: origin.x, y: origin.y },
      };
      this.active = { gesture, last: gesture.origin };
      events.push(this.emit({ type: "pending", gesture: { ...gesture } }));
    }
    return events;
  }

  /** Feeds movement for the owning pointer. Other pointers are ignored. */
  move(inputs: PointerSampleInput | readonly PointerSampleInput[]): PressGestureEvent[] {
    const active = this.active;
    const list = Array.isArray(inputs) ? inputs : [inputs as PointerSampleInput];
    const owned = list.filter((input) => input.pointerId === active?.gesture.pointerId);
    if (!active || owned.length === 0) {
      return [];
    }
    const before = this.strokes.activeStrokes()[0]?.samples.length ?? 0;
    const update = this.strokes.move(owned);
    return update ? this.advance(active, update.stroke.samples.slice(before)) : [];
  }

  /** Ends the owning pointer's gesture with its release sample. */
  release(input: PointerSampleInput): PressGestureEvent[] {
    const active = this.active;
    if (!active || active.gesture.pointerId !== input.pointerId) {
      return [];
    }
    const completed = this.strokes.end(input);
    if (!completed) {
      return [];
    }
    // The release sample may itself cross the threshold or move the drag.
    const events = this.advance(active, completed.stroke.samples.slice(-1));
    this.active = undefined;
    const gesture = { ...active.gesture };
    if (gesture.phase === "drag") {
      events.push(
        this.emit({
          type: "dragEnd",
          gesture,
          position: { ...active.last },
          total: offset(active.last, gesture.origin),
          stroke: completed.stroke,
        }),
      );
    } else {
      events.push(
        this.emit({
          type: "click",
          gesture,
          position: { ...gesture.origin },
          stroke: completed.stroke,
        }),
      );
    }
    return events;
  }

  /** Cancels the owned gesture for one pointer; other pointers are unaffected. */
  cancelPointer(pointerId: number, reason: PointerStrokeCancelReason): PressGestureEvent[] {
    if (this.active?.gesture.pointerId !== pointerId) {
      return [];
    }
    return this.cancel(reason);
  }

  /** Cancels the owned gesture, if any. A cancelled gesture never produces a click or drag end. */
  cancel(reason: PointerStrokeCancelReason): PressGestureEvent[] {
    return this.strokes.cancelAll(reason).flatMap((event) => this.finishCancelled(event));
  }

  current(): PressGestureSnapshot | undefined {
    return this.active ? { ...this.active.gesture } : undefined;
  }

  owns(pointerId: number): boolean {
    return this.active?.gesture.pointerId === pointerId;
  }

  private finishCancelled(strokeEvent: PointerStrokeEvent): PressGestureEvent[] {
    const active = this.active;
    this.active = undefined;
    if (!active) {
      return [];
    }
    return [
      this.emit({
        type: "cancel",
        gesture: { ...active.gesture },
        reason: strokeEvent.stroke.cancelReason ?? "reset",
        stroke: strokeEvent.stroke,
      }),
    ];
  }

  private advance(active: ActiveGesture, added: readonly PressGesturePoint[]): PressGestureEvent[] {
    const position = added.at(-1) ?? active.last;
    if (active.gesture.phase === "pending") {
      // Any sample past the threshold latches the drag, so jitter back below it cannot click.
      if (!added.some((sample) => this.travel(active, sample) > this.dragThresholdPx)) {
        return [];
      }
      active.gesture.phase = "drag";
      return [this.dragEvent("dragStart", active, position)];
    }
    if (position.x === active.last.x && position.y === active.last.y) {
      return [];
    }
    return [this.dragEvent("dragMove", active, position)];
  }

  private travel(active: ActiveGesture, point: PressGesturePoint): number {
    return Math.hypot(point.x - active.gesture.origin.x, point.y - active.gesture.origin.y);
  }

  private dragEvent(
    type: "dragStart" | "dragMove",
    active: ActiveGesture,
    position: PressGesturePoint,
  ): PressGestureEvent {
    const delta = offset(position, active.last);
    active.last = { x: position.x, y: position.y };
    return this.emit({
      type,
      gesture: { ...active.gesture },
      position: { ...active.last },
      delta,
      total: offset(active.last, active.gesture.origin),
    });
  }

  private emit(event: PressGestureEvent): PressGestureEvent {
    this.onGesture?.(event);
    return event;
  }
}

function offset(to: PressGesturePoint, from: PressGesturePoint): PressGesturePoint {
  return { x: to.x - from.x, y: to.y - from.y };
}
