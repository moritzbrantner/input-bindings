import type { StrokePoint, StrokeTrace } from "../src/index.ts";

/** Authored, deterministic stroke builders. Coordinates are element-local CSS pixels. */

export function stationary(x: number, y: number, durationMs: number): StrokeTrace {
  return {
    samples: [
      { x, y, t: 0 },
      { x, y, t: durationMs },
    ],
  };
}

export function line(
  from: { x: number; y: number },
  to: { x: number; y: number },
  durationMs: number,
  steps = 10,
): StrokeTrace {
  return {
    samples: Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        t: durationMs * ratio,
      };
    }),
  };
}

/**
 * Arc around a center. Angles are screen degrees (0 = east, 90 = north). Positive sweep turns
 * counter-clockwise on screen.
 */
export function arc(
  center: { x: number; y: number },
  radius: number,
  startDeg: number,
  sweepDeg: number,
  durationMs: number,
  steps = 48,
): StrokeTrace {
  return {
    samples: Array.from({ length: steps + 1 }, (_, index) => {
      const ratio = index / steps;
      const angle = ((startDeg + sweepDeg * ratio) * Math.PI) / 180;
      return {
        x: center.x + radius * Math.cos(angle),
        y: center.y - radius * Math.sin(angle),
        t: durationMs * ratio,
      };
    }),
  };
}

export function transform(
  trace: StrokeTrace,
  { scale = 1, dx = 0, dy = 0 }: { scale?: number; dx?: number; dy?: number },
): StrokeTrace {
  return {
    samples: trace.samples.map((sample): StrokePoint => ({
      x: sample.x * scale + dx,
      y: sample.y * scale + dy,
      t: sample.t,
    })),
  };
}

/** Keeps every `stride`-th sample plus the last, imitating a sparser input device. */
export function decimate(trace: StrokeTrace, stride: number): StrokeTrace {
  const samples = trace.samples.filter(
    (_, index) => index % stride === 0 || index === trace.samples.length - 1,
  );
  return { samples };
}
