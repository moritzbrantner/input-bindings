import type { ActionDefinition, Binding, ResolutionTrace } from "@moritzbrantner/input-bindings";
export type ResolutionHistoryEntry = {
    id: number;
    normalized: string;
    physicalCode: string;
    result: string;
};
export type ResolutionInspectorProps = {
    trace: ResolutionTrace;
    history: readonly ResolutionHistoryEntry[];
    actions: ReadonlyMap<string, ActionDefinition>;
    bindingById: ReadonlyMap<string, Binding>;
};
export declare function ResolutionInspector({ trace, history, actions, bindingById, }: ResolutionInspectorProps): import("react").JSX.Element;
