import type { ActionDefinition, Binding, ResolutionTrace } from "@moritzbrantner/input-bindings";
export interface ResolutionHistoryEntry {
    id: number;
    normalized: string;
    physicalCode: string;
    result: string;
}
export interface ResolutionInspectorProps {
    trace: ResolutionTrace;
    history: readonly ResolutionHistoryEntry[];
    actions: ReadonlyMap<string, ActionDefinition>;
    bindingById: ReadonlyMap<string, Binding>;
}
export declare function ResolutionInspector({ trace, history, actions, bindingById, }: ResolutionInspectorProps): import("react").JSX.Element;
