import { type Binding, type Conflict, type ContextLayer, type InputStroke } from "@moritzbrantner/input-bindings";
export type InputBindingsKeyboardMode = "logical" | "physical";
export type InputBindingsContextScenario = {
    id: string;
    label: string;
    description?: string;
    activeContexts?: readonly string[];
    stack?: readonly ContextLayer[];
    defaultKeyboardMode?: InputBindingsKeyboardMode;
};
export type ConflictScenarioOutcome = "notSimultaneouslyActive" | "orderedByStack" | "orderedByRank" | "ambiguous" | "chordWait";
export type ConflictScenarioAssessment = {
    scenarioId: string;
    scenarioLabel: string;
    outcome: ConflictScenarioOutcome;
};
export declare function deriveContextScenarios(bindings: readonly Binding[]): InputBindingsContextScenario[];
export declare function scenarioContextFacts(scenario: InputBindingsContextScenario): ReadonlySet<string>;
export declare function bindingsForScenario(bindings: readonly Binding[], scenario: InputBindingsContextScenario): Binding[];
export declare function assessConflictInScenarios(bindings: readonly Binding[], conflict: Conflict, scenarios: readonly InputBindingsContextScenario[]): ConflictScenarioAssessment[];
/**
 * Assesses every conflict against the declared scenarios while sharing resolver traces for identical
 * input prefixes. Conflict order and scenario order are preserved exactly.
 */
export declare function assessConflictsInScenarios(bindings: readonly Binding[], conflicts: readonly Conflict[], scenarios: readonly InputBindingsContextScenario[]): ConflictScenarioAssessment[][];
export declare function prettyContextLabel(value: string): string;
export type KeyContextShadowReason = "blockedByModal" | "lowerContextLayer" | "lowerRank";
export type KeyContextOutcome = {
    kind: "action";
    action: string;
    bindingId: string;
} | {
    kind: "ambiguous";
    actions: string[];
    bindingIds: string[];
}
/** A chord prefix: the runtime waits for the next stroke, then falls back to `exactActions`. */
 | {
    kind: "chord";
    exactActions: string[];
} | {
    kind: "none";
};
export type KeyContextBranch = {
    scenarioId: string;
    scenarioLabel: string;
    outcome: KeyContextOutcome;
    /** Exact matches that lost to the outcome, with the stack or rank reason. */
    shadowed: {
        action: string;
        bindingId: string;
        reason: KeyContextShadowReason;
    }[];
};
export type KeyContextNode = {
    /** Stable identity of the input sequence up to and including this stroke. */
    id: string;
    sequence: InputStroke[];
    /**
     * One branch per scenario, in scenario order. Continuations only list the scenarios where their
     * leader waits for another stroke.
     */
    branches: KeyContextBranch[];
    /** Chord continuations, sorted by stroke identity. */
    children: KeyContextNode[];
};
/**
 * Builds the inverse of the binding list: every bound input sequence (as a prefix tree) with what
 * the real stack resolver does with it in each declared scenario. It answers "what does Ctrl+F do
 * here?" without adding resolution rules of its own.
 */
export declare function buildKeyContextMap(bindings: readonly Binding[], scenarios: readonly InputBindingsContextScenario[]): KeyContextNode[];
/** Distinct actions an input selects across its scenario branches, in first-seen order. */
export declare function keyContextActions(node: KeyContextNode): string[];
/** Whether the resolver does something different with this input in at least two scenarios. */
export declare function keyContextVaries(node: KeyContextNode): boolean;
export type KeyContextFilter = {
    /** Matched case- and whitespace-insensitively against the input label, action ids and titles. */
    query?: string;
    onlyVarying?: boolean;
    titleOf?: (action: string) => string;
};
/**
 * Keeps nodes whose input or actions match. A matching input keeps its whole chord subtree; other
 * nodes stay only as the path to a matching continuation.
 */
export declare function filterKeyContextMap(nodes: readonly KeyContextNode[], filter?: KeyContextFilter): KeyContextNode[];
