import { type Binding, type InputStroke, type Resolution } from "./index.js";
export interface ContextLayer {
    id: string;
    blocksLower?: boolean;
}
export interface ContextStackPushOptions {
    blocksLower?: boolean;
}
export type ResolutionCandidateMatch = "none" | "exact" | "continuation";
export type ResolutionCandidateStatus = "inactiveContext" | "inputLongerThanBinding" | "sequenceMismatch" | "blockedByModal" | "lowerContextLayer" | "pendingExact" | "pendingContinuation" | "lowerRank" | "winner" | "equivalentWinner" | "ambiguousWinner";
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
/**
 * Mutable application-owned context stack. The last layer is the highest-priority layer.
 * Duplicate context ids are allowed so nested owners can push/pop the same semantic context safely.
 */
export declare class ContextStack {
    private layers;
    constructor(initial?: readonly ContextLayer[]);
    get size(): number;
    get top(): ContextLayer | undefined;
    push(id: string, options?: ContextStackPushOptions): void;
    pop(expectedId?: string): ContextLayer | undefined;
    clear(): void;
    replace(layers: readonly ContextLayer[]): void;
    snapshot(): ContextLayer[];
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
export declare function resolveWithContextStack(bindings: readonly Binding[], sequence: readonly InputStroke[], activeContexts: ReadonlySet<string>, contextStack: readonly ContextLayer[]): Resolution;
/**
 * Returns the bindings that are individually reachable in the supplied application context state.
 *
 * This prepares stack facts and modal barriers once for the whole batch. It intentionally does not
 * apply binding-vs-binding precedence: it answers whether each binding can participate at all.
 */
export declare function reachableBindingsWithContextStack(bindings: readonly Binding[], activeContexts: ReadonlySet<string>, contextStack: readonly ContextLayer[]): Binding[];
/**
 * Produces deterministic resolution evidence without changing the resolver's decision rules.
 * Candidate rows are sorted by binding id so the same state produces byte-stable inspector output.
 */
export declare function explainResolutionWithContextStack(bindings: readonly Binding[], sequence: readonly InputStroke[], activeContexts: ReadonlySet<string>, contextStack: readonly ContextLayer[]): ResolutionTrace;
