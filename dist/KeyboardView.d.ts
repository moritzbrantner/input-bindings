import type { Binding, Conflict, KeyStroke } from "@moritzbrantner/input-bindings";
export type KeyboardScope = "selectedAction" | "context" | "visible" | "conflicts";
export type KeyboardViewProps = {
    bindings: readonly Binding[];
    conflicts?: readonly Conflict[];
    selectedActionId?: string | undefined;
    selectedBindingId?: string | undefined;
    scope?: KeyboardScope;
    context?: string | undefined;
    visibleActionIds?: readonly string[];
    pressedCodes?: ReadonlySet<string>;
    highlightedSequence?: readonly KeyStroke[];
    layoutLabels?: ReadonlyMap<string, string> | undefined;
    onKeyInspect?: (code: string, bindingIds: string[]) => void;
};
export declare function KeyboardView({ bindings, conflicts, selectedActionId, selectedBindingId, scope, context, visibleActionIds, pressedCodes, highlightedSequence, layoutLabels, onKeyInspect, }: KeyboardViewProps): import("react").JSX.Element;
export declare function KeyboardLegend(): import("react").JSX.Element;
