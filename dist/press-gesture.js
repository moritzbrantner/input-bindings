import { DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS } from "./gesture-primitives.js";
import { PointerStrokeTracker, } from "./pointer-stroke.js";
/**
 * Deterministic press-gesture lifecycle for one button with a single owner: press → pending,
 * crossing the drag threshold → drag with continuous deltas, release below it → click at the press
 * position, and cancellation → no command. Samples are recorded by a `PointerStrokeTracker`, so
 * outcomes carry the same stroke evidence as gesture recognition.
 */
export class PressGestureTracker {
    button;
    dragThresholdPx;
    holdMinDurationMs;
    strokes;
    onGesture;
    active;
    constructor(options) {
        this.button = options.button ?? 0;
        this.dragThresholdPx =
            options.dragThresholdPx ?? DEFAULT_GESTURE_PRIMITIVE_THRESHOLDS.stationaryMaxTravelPx;
        if (!Number.isFinite(this.dragThresholdPx) || this.dragThresholdPx < 0) {
            throw new Error("Press gesture drag thresholds must be finite and non-negative");
        }
        this.holdMinDurationMs = options.holdMinDurationMs;
        if (this.holdMinDurationMs !== undefined &&
            (!Number.isFinite(this.holdMinDurationMs) || this.holdMinDurationMs < 0)) {
            throw new Error("Press gesture hold durations must be finite and non-negative");
        }
        this.strokes = new PointerStrokeTracker({ sourceId: options.sourceId, maxActiveStrokes: 1 });
        this.onGesture = options.onGesture;
    }
    /**
     * Starts a gesture. While another pointer owns the gesture the press is ignored; a repeated
     * press by the owning pointer first cancels the stale gesture as `superseded`.
     */
    press(input, surface) {
        if (this.active && this.active.gesture.pointerId !== input.pointerId) {
            return [];
        }
        const events = [];
        for (const strokeEvent of this.strokes.begin(input, surface)) {
            if (strokeEvent.phase === "cancel") {
                events.push(...this.finishCancelled(strokeEvent));
                continue;
            }
            const origin = strokeEvent.stroke.samples[0] ?? { x: 0, y: 0 };
            const gesture = {
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
    move(inputs) {
        const active = this.active;
        const list = Array.isArray(inputs) ? inputs : [inputs];
        const owned = list.filter((input) => input.pointerId === active?.gesture.pointerId);
        if (!active || owned.length === 0) {
            return [];
        }
        const before = this.strokes.activeStrokes()[0]?.samples.length ?? 0;
        const update = this.strokes.move(owned);
        return update ? this.advance(active, update.stroke.samples.slice(before)) : [];
    }
    /** Ends the owning pointer's gesture with its release sample. */
    release(input) {
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
        // Stroke time never runs backwards, so out-of-order timestamps cannot shorten a hold.
        const durationMs = completed.stroke.samples.at(-1)?.t ?? 0;
        if (gesture.phase === "drag") {
            events.push(this.emit({
                type: "dragEnd",
                gesture,
                position: { ...active.last },
                total: offset(active.last, gesture.origin),
                stroke: completed.stroke,
            }));
        }
        else if (this.holdMinDurationMs !== undefined && durationMs >= this.holdMinDurationMs) {
            events.push(this.emit({
                type: "hold",
                gesture,
                position: { ...gesture.origin },
                durationMs,
                stroke: completed.stroke,
            }));
        }
        else {
            events.push(this.emit({
                type: "click",
                gesture,
                position: { ...gesture.origin },
                stroke: completed.stroke,
            }));
        }
        return events;
    }
    /** Cancels the owned gesture for one pointer; other pointers are unaffected. */
    cancelPointer(pointerId, reason) {
        if (this.active?.gesture.pointerId !== pointerId) {
            return [];
        }
        return this.cancel(reason);
    }
    /** Cancels the owned gesture, if any. A cancelled gesture never produces a click or drag end. */
    cancel(reason) {
        return this.strokes.cancelAll(reason).flatMap((event) => this.finishCancelled(event));
    }
    current() {
        return this.active ? { ...this.active.gesture } : undefined;
    }
    owns(pointerId) {
        return this.active?.gesture.pointerId === pointerId;
    }
    finishCancelled(strokeEvent) {
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
    advance(active, added) {
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
    travel(active, point) {
        return Math.hypot(point.x - active.gesture.origin.x, point.y - active.gesture.origin.y);
    }
    dragEvent(type, active, position) {
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
    emit(event) {
        this.onGesture?.(event);
        return event;
    }
}
function offset(to, from) {
    return { x: to.x - from.x, y: to.y - from.y };
}
