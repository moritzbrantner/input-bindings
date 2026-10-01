import type { GestureMatch } from "@moritzbrantner/input-bindings";

import { compassDirection } from "./gesture-features.ts";
import type {
  PointerSampleInput,
  PointerStrokeCancelReason,
  PointerSurface,
} from "./pointer-stroke.ts";

type Point = { x: number; y: number };

export type MultiPointerPhase = "start" | "update" | "complete" | "cancel";
export type MultiPointerMode = "pinch" | "rotate" | "pan";

export type MultiPointerMetrics = {
  /** Midpoint of the two pointers in element-local CSS pixels. */
  centroid: Point;
  /** Centroid movement since the session started. */
  translation: { dx: number; dy: number; distance: number };
  /** Current pointer distance divided by the starting distance. */
  scale: number;
  /** Degrees the pointer pair turned since the start; positive is clockwise on screen. */
  rotation: number;
  /** Milliseconds since the second pointer joined. */
  durationMs: number;
};

export type MultiPointerSession = {
  id: string;
  /** The two pointer ids in ascending order; metrics never depend on which arrived first. */
  pointerIds: readonly [number, number];
  status: "active" | "completed" | "cancelled";
  cancelReason?: PointerStrokeCancelReason;
  metrics: MultiPointerMetrics;
  /** Modes currently past their activation threshold (with hysteresis). */
  active: Readonly<Record<MultiPointerMode, boolean>>;
};

export type MultiPointerEvent = {
  phase: MultiPointerPhase;
  session: MultiPointerSession;
};

/**
 * A mode activates when its magnitude reaches `activate` and deactivates only when it falls
 * below `deactivate`, so values hovering at one threshold cannot flicker.
 */
export type MultiPointerHysteresis = { activate: number; deactivate: number };

export type MultiPointerThresholds = {
  /** |ln(scale)|; 0.2 ≈ a 22% distance change. */
  pinch: MultiPointerHysteresis;
  /** |rotation| in degrees. */
  rotate: MultiPointerHysteresis;
  /** Centroid translation in CSS pixels. */
  pan: MultiPointerHysteresis;
};

export const DEFAULT_MULTI_POINTER_THRESHOLDS: Readonly<MultiPointerThresholds> = Object.freeze({
  pinch: { activate: 0.2, deactivate: 0.1 },
  rotate: { activate: 25, deactivate: 12 },
  pan: { activate: 50, deactivate: 25 },
});

export type MultiPointerTrackerOptions = {
  sourceId: string;
  thresholds?: Partial<MultiPointerThresholds> | undefined;
  onSession?: ((event: MultiPointerEvent) => void) | undefined;
};

type PointerState = { id: number; start: Point; current: Point; timeStamp: number };

type MutableSession = {
  id: string;
  pointers: [PointerState, PointerState];
  startTime: number;
  latestTime: number;
  active: Record<MultiPointerMode, boolean>;
};

/**
 * Groups exactly two concurrent pointers into one session. Additional pointers are ignored.
 * Lifting either pointer completes the session; cancelling either pointer cancels it.
 */
export class MultiPointerTracker {
  private readonly sourceId: string;
  private readonly thresholds: MultiPointerThresholds;
  private readonly onSession: ((event: MultiPointerEvent) => void) | undefined;
  private readonly waiting = new Map<number, PointerState>();
  private session: MutableSession | undefined;
  /** Frozen when the first pointer of a potential pair goes down. */
  private surface: PointerSurface | undefined;
  private nextSequence = 1;

  constructor(options: MultiPointerTrackerOptions) {
    if (!options.sourceId.trim()) {
      throw new Error("Multi-pointer source ids must not be empty");
    }
    this.sourceId = options.sourceId;
    this.thresholds = { ...DEFAULT_MULTI_POINTER_THRESHOLDS, ...options.thresholds };
    this.onSession = options.onSession;
  }

  /** Registers a pointer; the second concurrent pointer starts a session. */
  down(input: PointerSampleInput, surface: PointerSurface): MultiPointerEvent | undefined {
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
    const pair = [{ ...partner, start: partner.current }, pointer].sort(
      (left, right) => left.id - right.id,
    ) as [PointerState, PointerState];
    this.session = {
      id: `${this.sourceId}:${this.nextSequence++}`,
      pointers: pair,
      startTime: input.timeStamp,
      latestTime: input.timeStamp,
      active: { pinch: false, rotate: false, pan: false },
    };
    return this.emit("start", "active");
  }

  move(input: PointerSampleInput): MultiPointerEvent | undefined {
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
  up(input: PointerSampleInput): MultiPointerEvent | undefined {
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
  cancel(pointerId: number, reason: PointerStrokeCancelReason): MultiPointerEvent | undefined {
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

  cancelAll(reason: PointerStrokeCancelReason): MultiPointerEvent | undefined {
    this.waiting.clear();
    if (!this.session) {
      this.surface = undefined;
    }
    return this.session ? this.finish("cancelled", reason) : undefined;
  }

  isTracking(pointerId: number): boolean {
    return (
      this.waiting.has(pointerId) ||
      Boolean(this.session?.pointers.some((item) => item.id === pointerId))
    );
  }

  get hasSession(): boolean {
    return this.session !== undefined;
  }

  private updateActivation(): void {
    const session = this.session;
    if (!session) {
      return;
    }
    const metrics = sessionMetrics(session);
    const magnitudes: Record<MultiPointerMode, number> = {
      pinch: Math.abs(Math.log(metrics.scale)),
      rotate: Math.abs(metrics.rotation),
      pan: metrics.translation.distance,
    };
    for (const mode of ["pinch", "rotate", "pan"] as const) {
      const { activate, deactivate } = this.thresholds[mode];
      if (session.active[mode]) {
        session.active[mode] = magnitudes[mode] >= deactivate;
      } else {
        session.active[mode] = magnitudes[mode] >= activate;
      }
    }
  }

  private finish(
    status: "completed" | "cancelled",
    reason?: PointerStrokeCancelReason,
  ): MultiPointerEvent {
    const event = this.emit(status === "completed" ? "complete" : "cancel", status, reason);
    this.session = undefined;
    this.surface = undefined;
    this.waiting.clear();
    return event;
  }

  private emit(
    phase: MultiPointerPhase,
    status: MultiPointerSession["status"],
    reason?: PointerStrokeCancelReason,
  ): MultiPointerEvent {
    const session = this.session;
    if (!session) {
      throw new Error("Multi-pointer event without a session");
    }
    const event: MultiPointerEvent = {
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
export function recognizeMultiPointerGestures(session: MultiPointerSession): GestureMatch[] {
  if (session.status !== "completed") {
    return [];
  }
  const matches: GestureMatch[] = [];
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

function sessionMetrics(session: MutableSession): MultiPointerMetrics {
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

function pointerState(input: PointerSampleInput, surface: PointerSurface): PointerState {
  const point = localPoint(input, surface);
  return { id: input.pointerId, start: point, current: point, timeStamp: input.timeStamp };
}

function localPoint(input: PointerSampleInput, surface: PointerSurface): Point {
  return { x: input.clientX - surface.left, y: input.clientY - surface.top };
}

function midpoint(left: Point, right: Point): Point {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}
