export type AnalogActionKind = "axis1D" | "axis2D";
export type AnalogDispatchReason = "update" | "release" | "reset";

export interface Axis2D {
  x: number;
  y: number;
}

export interface AnalogActionDefinition {
  id: string;
  kind: AnalogActionKind;
  title?: string;
}

export interface AnalogAxis1DDispatch {
  action: string;
  kind: "axis1D";
  value: number;
  sourceIds: string[];
  reason: AnalogDispatchReason;
}

export interface AnalogAxis2DDispatch {
  action: string;
  kind: "axis2D";
  value: Axis2D;
  sourceIds: string[];
  reason: AnalogDispatchReason;
}

export type AnalogDispatch = AnalogAxis1DDispatch | AnalogAxis2DDispatch;

export interface AnalogInputControllerOptions {
  actions: readonly AnalogActionDefinition[];
  onDispatch?: (dispatch: AnalogDispatch) => void;
}

type AnalogValue = number | Axis2D;

interface SourceContribution {
  sourceId: string;
  action: string;
  kind: AnalogActionKind;
  value: AnalogValue;
}

const ZERO_AXIS_2D: Axis2D = { x: 0, y: 0 };

/**
 * Routes continuous sources to semantic analog actions.
 *
 * This deliberately sits beside the discrete InputRuntimeController. Continuous
 * values are not synthesized into InputStroke values or chord semantics.
 * Multiple sources for the same action are combined in stable source-id order
 * and clamped to the normalized [-1, 1] range.
 */
export class AnalogInputController {
  private readonly actions: ReadonlyMap<string, AnalogActionDefinition>;
  private readonly onDispatch?: (dispatch: AnalogDispatch) => void;
  private readonly contributions = new Map<string, SourceContribution>();
  private readonly lastValues = new Map<string, AnalogValue>();

  constructor(options: AnalogInputControllerOptions) {
    const actions = new Map<string, AnalogActionDefinition>();
    for (const action of options.actions) {
      if (!action.id.trim()) throw new Error("Analog action ids must not be empty");
      if (actions.has(action.id)) {
        throw new Error(`Duplicate analog action id: ${action.id}`);
      }
      actions.set(action.id, structuredClone(action));
    }
    this.actions = actions;
    this.onDispatch = options.onDispatch;
  }

  setAxis1D(sourceId: string, action: string, value: number): AnalogAxis1DDispatch | undefined {
    this.assertSourceId(sourceId);
    this.assertActionKind(action, "axis1D");
    this.contributions.set(contributionKey(sourceId, action), {
      sourceId,
      action,
      kind: "axis1D",
      value: normalizeAxis1D(value),
    });
    return this.emitIfChanged(action, "update") as AnalogAxis1DDispatch | undefined;
  }

  setAxis2D(sourceId: string, action: string, value: Axis2D): AnalogAxis2DDispatch | undefined {
    this.assertSourceId(sourceId);
    this.assertActionKind(action, "axis2D");
    this.contributions.set(contributionKey(sourceId, action), {
      sourceId,
      action,
      kind: "axis2D",
      value: normalizeAxis2D(value),
    });
    return this.emitIfChanged(action, "update") as AnalogAxis2DDispatch | undefined;
  }

  clearSource(sourceId: string, action?: string): AnalogDispatch[] {
    this.assertSourceId(sourceId);
    const affected = new Set<string>();
    for (const [key, contribution] of this.contributions) {
      if (contribution.sourceId !== sourceId) continue;
      if (action !== undefined && contribution.action !== action) continue;
      this.contributions.delete(key);
      affected.add(contribution.action);
    }

    return [...affected]
      .sort()
      .flatMap((actionId) => {
        const dispatch = this.emitIfChanged(actionId, "release");
        return dispatch ? [dispatch] : [];
      });
  }

  reset(): AnalogDispatch[] {
    const actions = [...new Set(this.contributions.values().map((entry) => entry.action))].sort();
    this.contributions.clear();
    return actions.flatMap((action) => {
      const dispatch = this.emitIfChanged(action, "reset");
      return dispatch ? [dispatch] : [];
    });
  }

  value(action: string): number | Axis2D {
    const definition = this.actions.get(action);
    if (!definition) throw new Error(`Unknown analog action: ${action}`);
    return structuredClone(this.aggregate(action, definition.kind).value);
  }

  private assertSourceId(sourceId: string): void {
    if (!sourceId.trim()) throw new Error("Analog source ids must not be empty");
  }

  private assertActionKind(action: string, kind: AnalogActionKind): void {
    const definition = this.actions.get(action);
    if (!definition) throw new Error(`Unknown analog action: ${action}`);
    if (definition.kind !== kind) {
      throw new Error(`Analog action ${action} expects ${definition.kind}, received ${kind}`);
    }
  }

  private emitIfChanged(action: string, reason: AnalogDispatchReason): AnalogDispatch | undefined {
    const definition = this.actions.get(action);
    if (!definition) return undefined;
    const aggregate = this.aggregate(action, definition.kind);
    const previous = this.lastValues.get(action);
    if (previous !== undefined && analogValueEquals(previous, aggregate.value)) {
      return undefined;
    }

    this.lastValues.set(action, structuredClone(aggregate.value));
    const dispatch: AnalogDispatch =
      definition.kind === "axis1D"
        ? {
            action,
            kind: "axis1D",
            value: aggregate.value as number,
            sourceIds: aggregate.sourceIds,
            reason,
          }
        : {
            action,
            kind: "axis2D",
            value: aggregate.value as Axis2D,
            sourceIds: aggregate.sourceIds,
            reason,
          };
    this.onDispatch?.(structuredClone(dispatch));
    return dispatch;
  }

  private aggregate(
    action: string,
    kind: AnalogActionKind,
  ): { value: AnalogValue; sourceIds: string[] } {
    const entries = [...this.contributions.values()]
      .filter((entry) => entry.action === action && entry.kind === kind)
      .sort((left, right) => left.sourceId.localeCompare(right.sourceId));
    const sourceIds = entries
      .filter((entry) => !isZeroValue(entry.value))
      .map((entry) => entry.sourceId);

    if (kind === "axis1D") {
      return {
        value: normalizeAxis1D(
          entries.reduce((sum, entry) => sum + (entry.value as number), 0),
        ),
        sourceIds,
      };
    }

    const sum = entries.reduce(
      (value, entry) => ({
        x: value.x + (entry.value as Axis2D).x,
        y: value.y + (entry.value as Axis2D).y,
      }),
      { ...ZERO_AXIS_2D },
    );
    return { value: normalizeAxis2D(sum), sourceIds };
  }
}

export function normalizeAxis1D(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

export function normalizeAxis2D(value: Axis2D): Axis2D {
  const x = Number.isFinite(value.x) ? value.x : 0;
  const y = Number.isFinite(value.y) ? value.y : 0;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 1 || magnitude === 0) return { x, y };
  return { x: x / magnitude, y: y / magnitude };
}

export function applyAxis1DDeadzone(value: number, deadzone: number): number {
  const normalized = normalizeAxis1D(value);
  const threshold = clamp(deadzone, 0, 0.999999);
  const magnitude = Math.abs(normalized);
  if (magnitude <= threshold) return 0;
  const remapped = (magnitude - threshold) / (1 - threshold);
  return Math.sign(normalized) * remapped;
}

export function applyAxis2DDeadzone(value: Axis2D, deadzone: number): Axis2D {
  const normalized = normalizeAxis2D(value);
  const magnitude = Math.hypot(normalized.x, normalized.y);
  const threshold = clamp(deadzone, 0, 0.999999);
  if (magnitude <= threshold || magnitude === 0) return { ...ZERO_AXIS_2D };
  const remapped = (magnitude - threshold) / (1 - threshold);
  return {
    x: (normalized.x / magnitude) * remapped,
    y: (normalized.y / magnitude) * remapped,
  };
}

export function scaleAxis1D(value: number, sensitivity: number): number {
  const scale = Number.isFinite(sensitivity) ? sensitivity : 1;
  return normalizeAxis1D(value * scale);
}

export function scaleAxis2D(value: Axis2D, sensitivity: number): Axis2D {
  const scale = Number.isFinite(sensitivity) ? sensitivity : 1;
  return normalizeAxis2D({ x: value.x * scale, y: value.y * scale });
}

export function smoothAxis1D(previous: number, next: number, response: number): number {
  const alpha = clamp(response, 0, 1);
  return normalizeAxis1D(previous + (next - previous) * alpha);
}

export function smoothAxis2D(previous: Axis2D, next: Axis2D, response: number): Axis2D {
  const alpha = clamp(response, 0, 1);
  return normalizeAxis2D({
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  });
}

export function rotateAxis2D(value: Axis2D, degrees: number): Axis2D {
  if (!Number.isFinite(degrees)) return normalizeAxis2D(value);
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return normalizeAxis2D({
    x: value.x * cos - value.y * sin,
    y: value.x * sin + value.y * cos,
  });
}

function contributionKey(sourceId: string, action: string): string {
  return `${sourceId}\u0000${action}`;
}

function analogValueEquals(left: AnalogValue, right: AnalogValue): boolean {
  if (typeof left === "number" || typeof right === "number") {
    return typeof left === "number" && typeof right === "number" && Object.is(left, right);
  }
  return Object.is(left.x, right.x) && Object.is(left.y, right.y);
}

function isZeroValue(value: AnalogValue): boolean {
  return typeof value === "number"
    ? Object.is(value, 0) || Object.is(value, -0)
    : (Object.is(value.x, 0) || Object.is(value.x, -0)) &&
        (Object.is(value.y, 0) || Object.is(value.y, -0));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
