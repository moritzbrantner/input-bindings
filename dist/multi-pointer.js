import { compassDirection } from "./gesture-features.js";
export const DEFAULT_MULTI_POINTER_THRESHOLDS = Object.freeze({
    pinch: { activate: 0.2, deactivate: 0.1 },
    rotate: { activate: 25, deactivate: 12 },
    pan: { activate: 50, deactivate: 25 },
});
/**
 * Groups exactly two concurrent pointers into one session. Additional pointers are ignored.
 * Lifting either pointer completes the session; cancelling either pointer cancels it.
 */
export class MultiPointerTracker {
    sourceId;
    thresholds;
    onSession;
    waiting = new Map();
    session;
    /** Frozen when the first pointer of a potential pair goes down. */
    surface;
    nextSequence = 1;
    constructor(options) {
        if (!options.sourceId.trim()) {
            throw new Error("Multi-pointer source ids must not be empty");
        }
        this.sourceId = options.sourceId;
        this.thresholds = { ...DEFAULT_MULTI_POINTER_THRESHOLDS, ...options.thresholds };
        this.onSession = options.onSession;
    }
    /** Registers a pointer; the second concurrent pointer starts a session. */
    down(input, surface) {
        if (this.session) {
            return undefined;
        }
        if (this.waiting.size === 0) {
            this.surface = { ...surface };
        }
        const pointer = pointerState(input, this.surface ?? surface);
        this.waiting.delete(input.pointerId);
        const partner = [...this.waiting.values()].sort((left, right) => left.id - right.id)[0];
        if (!partner) {
            this.waiting.set(input.pointerId, pointer);
            return undefined;
        }
        this.waiting.clear();
        // Both pointers restart from their positions at the moment the pair forms.
        const pair = [{ ...partner, start: partner.current }, pointer].sort((left, right) => left.id - right.id);
        this.session = {
            id: `${this.sourceId}:${this.nextSequence++}`,
            pointers: pair,
            startTime: input.timeStamp,
            latestTime: input.timeStamp,
            active: { pinch: false, rotate: false, pan: false },
        };
        return this.emit("start", "active");
    }
    move(input) {
        const surface = this.surface;
        if (!surface) {
            return undefined;
        }
        const waiting = this.waiting.get(input.pointerId);
        if (waiting) {
            waiting.current = localPoint(input, surface);
            return undefined;
        }
        const pointer = this.session?.pointers.find((item) => item.id === input.pointerId);
        if (!this.session || !pointer) {
            return undefined;
        }
        pointer.current = localPoint(input, surface);
        this.session.latestTime = Math.max(this.session.latestTime, input.timeStamp);
        this.updateActivation();
        return this.emit("update", "active");
    }
    /** Lifting either session pointer completes the session with its final metrics. */
    up(input) {
        if (this.waiting.delete(input.pointerId)) {
            if (this.waiting.size === 0) {
                this.surface = undefined;
            }
            return undefined;
        }
        const surface = this.surface;
        if (!this.session || !surface) {
            return undefined;
        }
        const pointer = this.session.pointers.find((item) => item.id === input.pointerId);
        if (!pointer) {
            return undefined;
        }
        pointer.current = localPoint(input, surface);
        this.session.latestTime = Math.max(this.session.latestTime, input.timeStamp);
        this.updateActivation();
        return this.finish("completed");
    }
    /** Cancelling either session pointer cancels the whole session. */
    cancel(pointerId, reason) {
        if (this.waiting.delete(pointerId)) {
            if (this.waiting.size === 0) {
                this.surface = undefined;
            }
            return undefined;
        }
        if (!this.session?.pointers.some((item) => item.id === pointerId)) {
            return undefined;
        }
        return this.finish("cancelled", reason);
    }
    cancelAll(reason) {
        this.waiting.clear();
        if (!this.session) {
            this.surface = undefined;
        }
        return this.session ? this.finish("cancelled", reason) : undefined;
    }
    isTracking(pointerId) {
        return (this.waiting.has(pointerId) ||
            Boolean(this.session?.pointers.some((item) => item.id === pointerId)));
    }
    get hasSession() {
        return this.session !== undefined;
    }
    updateActivation() {
        const session = this.session;
        if (!session) {
            return;
        }
        const metrics = sessionMetrics(session);
        const magnitudes = {
            pinch: Math.abs(Math.log(metrics.scale)),
            rotate: Math.abs(metrics.rotation),
            pan: metrics.translation.distance,
        };
        for (const mode of ["pinch", "rotate", "pan"]) {
            const { activate, deactivate } = this.thresholds[mode];
            if (session.active[mode]) {
                session.active[mode] = magnitudes[mode] >= deactivate;
            }
            else {
                session.active[mode] = magnitudes[mode] >= activate;
            }
        }
    }
    finish(status, reason) {
        const event = this.emit(status === "completed" ? "complete" : "cancel", status, reason);
        this.session = undefined;
        this.surface = undefined;
        this.waiting.clear();
        return event;
    }
    emit(phase, status, reason) {
        const session = this.session;
        if (!session) {
            throw new Error("Multi-pointer event without a session");
        }
        const event = {
            phase,
            session: {
                id: session.id,
                pointerIds: [session.pointers[0].id, session.pointers[1].id],
                status,
                ...(reason ? { cancelReason: reason } : {}),
                metrics: sessionMetrics(session),
                active: { ...session.active },
            },
        };
        this.onSession?.(event);
        return event;
    }
}
/**
 * Converts a completed session into gesture matches: every mode active at completion, in the
 * fixed order pinch, rotate, two-finger swipe. Cancelled sessions never produce matches.
 */
export function recognizeMultiPointerGestures(session) {
    if (session.status !== "completed") {
        return [];
    }
    const matches = [];
    const { metrics, active } = session;
    if (active.pinch) {
        matches.push({ kind: "pinch", direction: metrics.scale > 1 ? "out" : "in" });
    }
    if (active.rotate) {
        matches.push({
            kind: "rotate",
            orientation: metrics.rotation > 0 ? "clockwise" : "counterClockwise",
        });
    }
    if (active.pan) {
        const angle = (Math.atan2(-metrics.translation.dy, metrics.translation.dx) * 180) / Math.PI;
        matches.push({ kind: "twoFingerSwipe", direction: compassDirection(angle) });
    }
    return matches;
}
function sessionMetrics(session) {
    const [a, b] = session.pointers;
    const startCentroid = midpoint(a.start, b.start);
    const centroid = midpoint(a.current, b.current);
    const startDistance = Math.hypot(b.start.x - a.start.x, b.start.y - a.start.y);
    const distance = Math.hypot(b.current.x - a.current.x, b.current.y - a.current.y);
    const startAngle = Math.atan2(b.start.y - a.start.y, b.start.x - a.start.x);
    const angle = Math.atan2(b.current.y - a.current.y, b.current.x - a.current.x);
    let rotation = ((angle - startAngle) * 180) / Math.PI;
    rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
    const dx = centroid.x - startCentroid.x;
    const dy = centroid.y - startCentroid.y;
    return {
        centroid,
        translation: { dx, dy, distance: Math.hypot(dx, dy) },
        scale: startDistance > 0 ? distance / startDistance : 1,
        rotation,
        durationMs: Math.max(0, session.latestTime - session.startTime),
    };
}
function pointerState(input, surface) {
    const point = localPoint(input, surface);
    return { id: input.pointerId, start: point, current: point, timeStamp: input.timeStamp };
}
function localPoint(input, surface) {
    return { x: input.clientX - surface.left, y: input.clientY - surface.top };
}
function midpoint(left, right) {
    return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}
