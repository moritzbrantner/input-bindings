import { type Binding, type Conflict, type ContextLayer } from "@moritzbrantner/input-bindings";
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
