import { type ActionDefinition, type Binding, type Conflict, type ConflictRepair } from "@moritzbrantner/input-bindings";
import { type InputBindingsContextScenario } from "./workbench-model.js";
export type ConflictRepairPanelProps = {
    bindings: readonly Binding[];
    conflicts: readonly Conflict[];
    actions: ReadonlyMap<string, ActionDefinition>;
    scenarios?: readonly InputBindingsContextScenario[];
    onApplyRepair: (repair: ConflictRepair) => void;
};
export declare function ConflictRepairPanel({ bindings, conflicts, actions, scenarios, onApplyRepair, }: ConflictRepairPanelProps): import("react").JSX.Element;
