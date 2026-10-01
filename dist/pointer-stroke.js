/**
 * Deterministic pointer stroke/session lifecycle. It records normalized samples per pointer and
 * never interprets them; recognizers and consumers read the resulting strokes.
 */
export class PointerStrokeTracker {
    sourceId;
    maxActiveStrokes;
    onStroke;
    active = new Map();
    nextSequence = 1;
    constructor(options) {
        if (!options.sourceId.trim()) {
            throw new Error("Pointer stroke source ids must not be empty");
        }
        this.sourceId = options.sourceId;
        this.maxActiveStrokes = Math.max(1, Math.floor(options.maxActiveStrokes ?? 1));
        this.onStroke = options.onStroke;
    }
    /**
     * Starts a stroke. A repeated start for an already active pointer id first cancels the stale
     * stroke as `superseded`, so a missed release cannot strand state.
     */
    begin(input, surface) {
        const events = [];
        const stale = this.cancel(input.pointerId, "superseded");
        if (stale) {
            events.push(stale);
        }
        if (this.active.size >= this.maxActiveStrokes) {
            return events;
        }
        const sequence = this.nextSequence++;
        const stroke = {
            id: `${this.sourceId}:${sequence}`,
            sourceId: this.sourceId,
            sequence,
            pointerId: input.pointerId,
            pointerType: normalizePointerKind(input.pointerType),
            surface: { ...surface },
            status: "active",
            samples: [toSample(input, surface, undefined)],
        };
        this.active.set(input.pointerId, stroke);
        events.push(this.emit("start", stroke));
        return events;
    }
    /** Appends samples to an active stroke. Inputs for untracked pointers are ignored. */
    move(inputs) {
        const list = Array.isArray(inputs) ? inputs : [inputs];
        const first = list[0];
        if (!first) {
            return undefined;
        }
        const stroke = this.active.get(first.pointerId);
        if (!stroke) {
            return undefined;
        }
        for (const input of list) {
            if (input.pointerId === stroke.pointerId) {
                stroke.samples.push(toSample(input, stroke.surface, stroke.samples.at(-1)));
            }
        }
        return this.emit("update", stroke);
    }
    /** Completes an active stroke with its release sample. */
    end(input) {
        const stroke = this.active.get(input.pointerId);
        if (!stroke) {
            return undefined;
        }
        stroke.samples.push(toSample(input, stroke.surface, stroke.samples.at(-1)));
        return this.finish(stroke, "completed");
    }
    /** Cancels one active stroke without adding a sample. */
    cancel(pointerId, reason) {
        const stroke = this.active.get(pointerId);
        if (!stroke) {
            return undefined;
        }
        return this.finish(stroke, "cancelled", reason);
    }
    /** Cancels every active stroke in start order. */
    cancelAll(reason) {
        return [...this.active.values()]
            .sort((left, right) => left.sequence - right.sequence)
            .map((stroke) => this.finish(stroke, "cancelled", reason));
    }
    isActive(pointerId) {
        return this.active.has(pointerId);
    }
    activeStrokes() {
        return [...this.active.values()]
            .sort((left, right) => left.sequence - right.sequence)
            .map((stroke) => snapshot(stroke));
    }
    finish(stroke, status, reason) {
        this.active.delete(stroke.pointerId);
        stroke.status = status;
        if (reason) {
            stroke.cancelReason = reason;
        }
        Object.freeze(stroke.samples);
        return this.emit(status === "completed" ? "complete" : "cancel", stroke);
    }
    emit(phase, stroke) {
        const event = { phase, stroke: snapshot(stroke) };
        this.onStroke?.(event);
        return event;
    }
}
export function normalizePointerKind(pointerType) {
    switch (pointerType) {
        case "mouse":
        case "touch":
        case "pen": {
            return pointerType;
        }
        default: {
            return "unknown";
        }
    }
}
function snapshot(stroke) {
    return { ...stroke, surface: { ...stroke.surface } };
}
function toSample(input, surface, previous) {
    const timeStamp = Number.isFinite(input.timeStamp) ? input.timeStamp : (previous?.timeStamp ?? 0);
    // Out-of-order or repeated timestamps never move stroke time backwards.
    const dt = previous ? Math.max(0, timeStamp - previous.timeStamp) : 0;
    const sample = {
        x: input.clientX - surface.left,
        y: input.clientY - surface.top,
        clientX: input.clientX,
        clientY: input.clientY,
        t: previous ? previous.t + dt : 0,
        dt,
        timeStamp: previous ? Math.max(previous.timeStamp, timeStamp) : timeStamp,
        buttons: input.buttons ?? 0,
    };
    if (isFiniteNumber(input.pressure)) {
        sample.pressure = input.pressure;
    }
    if (isFiniteNumber(input.tiltX)) {
        sample.tiltX = input.tiltX;
    }
    if (isFiniteNumber(input.tiltY)) {
        sample.tiltY = input.tiltY;
    }
    return sample;
}
function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
