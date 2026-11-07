import type { ActionDefinition, Binding } from "@moritzbrantner/input-bindings";
import { type InputBindingsContextScenario } from "./workbench-model.js";
export type KeyContextMapProps = {
    bindings: readonly Binding[];
    scenarios: readonly InputBindingsContextScenario[];
    actions: ReadonlyMap<string, ActionDefinition>;
};
/**
 * Inverse view of the bindings: each bound input as a tree root, branching into every declared
 * context scenario and the action the stack resolver selects there. Chord prefixes nest their
 * continuations.
 */
export declare function KeyContextMap({ bindings, scenarios, actions }: KeyContextMapProps): import("react").JSX.Element;
