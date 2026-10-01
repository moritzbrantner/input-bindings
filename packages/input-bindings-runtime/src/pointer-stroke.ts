export type PointerKind = "mouse" | "touch" | "pen" | "unknown";
export type PointerStrokePhase = "start" | "update" | "complete" | "cancel";
export type PointerStrokeStatus = "active" | "completed" | "cancelled";
export type PointerStrokeCancelReason =
  | "pointerCancel"
  | "lostPointerCapture"
  | "blur"
  | "hidden"
  | "detach"
  | "superseded"
  | "reset";

/** Element rectangle in viewport CSS pixels, frozen when a stroke starts. */
export type PointerSurface = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** One raw pointer observation, as delivered by a Pointer Events adapter or a fixture. */
export type PointerSampleInput = {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  timeStamp: number;
  buttons?: number | undefined;
  pressure?: number | undefined;
  tiltX?: number | undefined;
  tiltY?: number | undefined;
};

export type PointerSample = {
  /** Element-local CSS pixels relative to the surface captured at stroke start. */
  x: number;
  y: number;
  /** Original viewport coordinates, retained as debugging evidence. */
  clientX: number;
  clientY: number;
  /** Milliseconds since the first sample of the stroke. Never decreases. */
  t: number;
  /** Milliseconds since the previous sample; 0 for the first sample. */
  dt: number;
  /** Original event timestamp, retained as debugging evidence. */
  timeStamp: number;
  buttons: number;
  pressure?: number;
  tiltX?: number;
  tiltY?: number;
};

export type PointerStroke = {
  /** Stable within one tracker: `${sourceId}:${sequence}`. */
  id: string;
  sourceId: string;
  /** Monotonic per-tracker start order. */
  sequence: number;
  pointerId: number;
  pointerType: PointerKind;
  surface: PointerSurface;
  status: PointerStrokeStatus;
  cancelReason?: PointerStrokeCancelReason;
  /** Grows while the stroke is active; frozen once it completes or cancels. */
  samples: readonly PointerSample[];
};

export type PointerStrokeEvent = {
  phase: PointerStrokePhase;
  stroke: PointerStroke;
};

export type PointerStrokeTrackerOptions = {
  sourceId: string;
  /**
   * Maximum strokes tracked at once. Additional pointers that begin while the limit is reached
   * are ignored rather than displacing an active stroke. Defaults to 1 (single-pointer capture).
   */
  maxActiveStrokes?: number | undefined;
  onStroke?: ((event: PointerStrokeEvent) => void) | undefined;
};

type MutableStroke = Omit<PointerStroke, "samples"> & { samples: PointerSample[] };

/**
 * Deterministic pointer stroke/session lifecycle. It records normalized samples per pointer and
 * never interprets them; recognizers and consumers read the resulting strokes.
 */
export class PointerStrokeTracker {
  private readonly sourceId: string;
  private readonly maxActiveStrokes: number;
  private readonly onStroke: ((event: PointerStrokeEvent) => void) | undefined;
  private readonly active = new Map<number, MutableStroke>();
  private nextSequence = 1;

  constructor(options: PointerStrokeTrackerOptions) {
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
  begin(input: PointerSampleInput, surface: PointerSurface): PointerStrokeEvent[] {
    const events: PointerStrokeEvent[] = [];
    const stale = this.cancel(input.pointerId, "superseded");
    if (stale) {
      events.push(stale);
    }
    if (this.active.size >= this.maxActiveStrokes) {
      return events;
    }
    const sequence = this.nextSequence++;
    const stroke: MutableStroke = {
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
  move(inputs: PointerSampleInput | readonly PointerSampleInput[]): PointerStrokeEvent | undefined {
    const list = Array.isArray(inputs) ? inputs : [inputs as PointerSampleInput];
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
  end(input: PointerSampleInput): PointerStrokeEvent | undefined {
    const stroke = this.active.get(input.pointerId);
    if (!stroke) {
      return undefined;
    }
    stroke.samples.push(toSample(input, stroke.surface, stroke.samples.at(-1)));
    return this.finish(stroke, "completed");
  }

  /** Cancels one active stroke without adding a sample. */
  cancel(pointerId: number, reason: PointerStrokeCancelReason): PointerStrokeEvent | undefined {
    const stroke = this.active.get(pointerId);
    if (!stroke) {
      return undefined;
    }
    return this.finish(stroke, "cancelled", reason);
  }

  /** Cancels every active stroke in start order. */
  cancelAll(reason: PointerStrokeCancelReason): PointerStrokeEvent[] {
    return [...this.active.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map((stroke) => this.finish(stroke, "cancelled", reason));
  }

  isActive(pointerId: number): boolean {
    return this.active.has(pointerId);
  }

  activeStrokes(): PointerStroke[] {
    return [...this.active.values()]
      .sort((left, right) => left.sequence - right.sequence)
      .map((stroke) => snapshot(stroke));
  }

  private finish(
    stroke: MutableStroke,
    status: "completed" | "cancelled",
    reason?: PointerStrokeCancelReason,
  ): PointerStrokeEvent {
    this.active.delete(stroke.pointerId);
    stroke.status = status;
    if (reason) {
      stroke.cancelReason = reason;
    }
    Object.freeze(stroke.samples);
    return this.emit(status === "completed" ? "complete" : "cancel", stroke);
  }

  private emit(phase: PointerStrokePhase, stroke: MutableStroke): PointerStrokeEvent {
    const event: PointerStrokeEvent = { phase, stroke: snapshot(stroke) };
    this.onStroke?.(event);
    return event;
  }
}

export function normalizePointerKind(pointerType: string): PointerKind {
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

function snapshot(stroke: MutableStroke): PointerStroke {
  return { ...stroke, surface: { ...stroke.surface } };
}

function toSample(
  input: PointerSampleInput,
  surface: PointerSurface,
  previous: PointerSample | undefined,
): PointerSample {
  const timeStamp = Number.isFinite(input.timeStamp) ? input.timeStamp : (previous?.timeStamp ?? 0);
  // Out-of-order or repeated timestamps never move stroke time backwards.
  const dt = previous ? Math.max(0, timeStamp - previous.timeStamp) : 0;
  const sample: PointerSample = {
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

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
