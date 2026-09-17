import {
  evaluateWhen,
  inputStrokeEquals,
  resolve,
  whenSpecificity,
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

export type ResolutionCandidateMatch = "none" | "exact" | "continuation";

export type ResolutionCandidateStatus =
  | "inactiveContext"
  | "inputLongerThanBinding"
  | "sequenceMismatch"
  | "blockedByModal"
  | "lowerContextLayer"
  | "pendingExact"
  | "pendingContinuation"
  | "lowerRank"
  | "winner"
  | "equivalentWinner"
  | "ambiguousWinner";

export interface ResolutionCandidateTrace {
  bindingId: string;
  action: string;
  match: ResolutionCandidateMatch;
  status: ResolutionCandidateStatus;
  ownerDepth?: number;
  priority: number;
  specificity: number;
}

export interface ResolutionBarrierTrace {
  id: string;
  depth: number;
}

export interface ResolutionTrace {
  resolution: Resolution;
  activeContexts: string[];
  contextStack: ContextLayer[];
  barrier?: ResolutionBarrierTrace;
  candidates: ResolutionCandidateTrace[];
}

interface WorkingCandidate {
  binding: Binding;
  traceIndex: number;
  depth: number;
  match: Exclude<ResolutionCandidateMatch, "none">;
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
  return explainResolutionWithContextStack(
    bindings,
    sequence,
    activeContexts,
    contextStack,
  ).resolution;
}

/**
 * Produces deterministic resolution evidence without changing the resolver's decision rules.
 * Candidate rows are sorted by binding id so the same state produces byte-stable inspector output.
 */
export function explainResolutionWithContextStack(
  bindings: readonly Binding[],
  sequence: readonly InputStroke[],
  activeContexts: ReadonlySet<string>,
  contextStack: readonly ContextLayer[],
): ResolutionTrace {
  const contexts = new Set(activeContexts);
  const depthByContext = new Map<string, number>();
  let barrier: ResolutionBarrierTrace | undefined;

  contextStack.forEach((layer, index) => {
    contexts.add(layer.id);
    depthByContext.set(layer.id, index);
    if (layer.blocksLower) barrier = { id: layer.id, depth: index };
  });

  const baseTrace = {
    activeContexts: [...contexts].sort(),
    contextStack: contextStack.map(cloneLayer),
    ...(barrier ? { barrier } : {}),
  };

  if (sequence.length === 0) {
    return { resolution: { kind: "none" }, ...baseTrace, candidates: [] };
  }

  const candidates: ResolutionCandidateTrace[] = [];
  const working: WorkingCandidate[] = [];
  const sortedBindings = [...bindings].sort((left, right) => left.id.localeCompare(right.id));

  for (const binding of sortedBindings) {
    const base = {
      bindingId: binding.id,
      action: binding.action,
      priority: binding.priority ?? 0,
      specificity: whenSpecificity(binding.when),
    };

    if (!evaluateWhen(binding.when, contexts)) {
      candidates.push({ ...base, match: "none", status: "inactiveContext" });
      continue;
    }
    if (sequence.length > binding.sequence.length) {
      candidates.push({ ...base, match: "none", status: "inputLongerThanBinding" });
      continue;
    }
    if (!sequence.every((stroke, index) => inputStrokeEquals(stroke, binding.sequence[index]))) {
      candidates.push({ ...base, match: "none", status: "sequenceMismatch" });
      continue;
    }

    const depth = ownerDepth(binding.when, depthByContext);
    const match = sequence.length === binding.sequence.length ? "exact" : "continuation";
    if (barrier && depth < barrier.depth) {
      candidates.push({
        ...base,
        match,
        status: "blockedByModal",
        ownerDepth: depth,
      });
      continue;
    }

    const traceIndex = candidates.length;
    candidates.push({
      ...base,
      match,
      status: "lowerContextLayer",
      ownerDepth: depth,
    });
    working.push({ binding, traceIndex, depth, match });
  }

  if (working.length === 0) {
    return { resolution: { kind: "none" }, ...baseTrace, candidates };
  }

  const topDepth = Math.max(...working.map((candidate) => candidate.depth));
  const selected = working.filter((candidate) => candidate.depth === topDepth);
  const selectedBindings = selected.map((candidate) => candidate.binding);
  const resolution = resolve(selectedBindings, sequence, contexts);

  for (const candidate of selected) {
    const trace = candidates[candidate.traceIndex];
    switch (resolution.kind) {
      case "pending":
        trace.status = candidate.match === "exact" ? "pendingExact" : "pendingContinuation";
        break;
      case "ambiguous":
        trace.status = resolution.bindingIds.includes(candidate.binding.id)
          ? "ambiguousWinner"
          : "lowerRank";
        break;
      case "resolved": {
        if (candidate.binding.id === resolution.bindingId) {
          trace.status = "winner";
          break;
        }
        const winner = selectedBindings.find((binding) => binding.id === resolution.bindingId);
        trace.status = winner && sameRank(candidate.binding, winner) && candidate.binding.action === winner.action
          ? "equivalentWinner"
          : "lowerRank";
        break;
      }
      case "none":
        trace.status = "lowerRank";
        break;
    }
  }

  return { resolution, ...baseTrace, candidates };
}

function sameRank(left: Binding, right: Binding): boolean {
  return (
    (left.priority ?? 0) === (right.priority ?? 0) &&
    whenSpecificity(left.when) === whenSpecificity(right.when)
  );
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
