import {
  evaluateWhen,
  inputStrokeEquals,
  resolve,
  type Binding,
  type InputStroke,
  type Resolution,
  type WhenExpr,
} from "./index.ts";

export interface ContextLayer {
  id: string;
  blocksLower?: boolean;
}

export interface ContextStackPushOptions {
  blocksLower?: boolean;
}

/**
 * Mutable application-owned context stack. The last layer is the highest-priority layer.
 * Duplicate context ids are allowed so nested owners can push/pop the same semantic context safely.
 */
export class ContextStack {
  private layers: ContextLayer[];

  constructor(initial: readonly ContextLayer[] = []) {
    this.layers = initial.map(cloneLayer);
  }

  get size(): number {
    return this.layers.length;
  }

  get top(): ContextLayer | undefined {
    const layer = this.layers.at(-1);
    return layer ? cloneLayer(layer) : undefined;
  }

  push(id: string, options: ContextStackPushOptions = {}): void {
    if (id.length === 0) throw new Error("Context layer id must not be empty.");
    this.layers.push(canonicalLayer({ id, blocksLower: options.blocksLower }));
  }

  pop(expectedId?: string): ContextLayer | undefined {
    const top = this.layers.at(-1);
    if (!top || (expectedId !== undefined && top.id !== expectedId)) return undefined;
    return cloneLayer(this.layers.pop()!);
  }

  clear(): void {
    this.layers = [];
  }

  replace(layers: readonly ContextLayer[]): void {
    this.layers = layers.map((layer) => {
      if (layer.id.length === 0) throw new Error("Context layer id must not be empty.");
      return canonicalLayer(layer);
    });
  }

  snapshot(): ContextLayer[] {
    return this.layers.map(cloneLayer);
  }
}

/**
 * Resolves an input using ordered application contexts.
 *
 * Layer precedence is considered before a binding's explicit priority/specificity. A binding belongs
 * to the highest stack layer that it references positively in its `when` expression. Bindings that do
 * not positively reference a stack layer are fallback/global bindings at depth -1. A `blocksLower`
 * layer suppresses every binding owned by a lower layer, including fallback bindings.
 *
 * `activeContexts` remains independent from the stack so consumers can continue supplying boolean
 * facts such as `selectionExists` or `textInputFocused`; stack layer ids are merged into that set for
 * expression evaluation.
 */
export function resolveWithContextStack(
  bindings: readonly Binding[],
  sequence: readonly InputStroke[],
  activeContexts: ReadonlySet<string>,
  contextStack: readonly ContextLayer[],
): Resolution {
  if (sequence.length === 0) return { kind: "none" };

  const contexts = new Set(activeContexts);
  const depthByContext = new Map<string, number>();
  let barrierDepth = -1;

  contextStack.forEach((layer, index) => {
    contexts.add(layer.id);
    depthByContext.set(layer.id, index);
    if (layer.blocksLower) barrierDepth = index;
  });

  let topDepth: number | undefined;
  const selected: Binding[] = [];

  for (const binding of bindings) {
    if (!evaluateWhen(binding.when, contexts) || sequence.length > binding.sequence.length) continue;
    if (!sequence.every((stroke, index) => inputStrokeEquals(stroke, binding.sequence[index]))) {
      continue;
    }

    const depth = ownerDepth(binding.when, depthByContext);
    if (depth < barrierDepth) continue;

    if (topDepth === undefined || depth > topDepth) {
      topDepth = depth;
      selected.length = 0;
      selected.push(binding);
    } else if (depth === topDepth) {
      selected.push(binding);
    }
  }

  return topDepth === undefined ? { kind: "none" } : resolve(selected, sequence, contexts);
}

function ownerDepth(
  expression: WhenExpr | undefined,
  depthByContext: ReadonlyMap<string, number>,
  positive = true,
): number {
  const expr = expression ?? ({ op: "always" } as const);
  switch (expr.op) {
    case "always":
      return -1;
    case "context":
      return positive ? (depthByContext.get(expr.id) ?? -1) : -1;
    case "not":
      return ownerDepth(expr.expr, depthByContext, !positive);
    case "all":
    case "any":
      return expr.exprs.reduce(
        (depth, child) => Math.max(depth, ownerDepth(child, depthByContext, positive)),
        -1,
      );
  }
}

function canonicalLayer(layer: ContextLayer): ContextLayer {
  return layer.blocksLower ? { id: layer.id, blocksLower: true } : { id: layer.id };
}

function cloneLayer(layer: ContextLayer): ContextLayer {
  return canonicalLayer(layer);
}
