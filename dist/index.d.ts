import { type ActionRegistry, type Binding, type CompiledActionRegistry, type Conflict, type KeyStroke, type Profile } from "@moritzbrantner/input-bindings";
export * from "./keyboard.js";
export * from "./model.js";
export type KeybindingEditorPresentation = "split" | "list" | "keyboard";
export interface KeybindingEditorProps {
    registry: ActionRegistry;
    profile: Profile;
    onProfileChange: (profile: Profile) => void;
    compiledRegistry?: CompiledActionRegistry;
    presentation?: KeybindingEditorPresentation;
    className?: string;
}
export type KeyboardScope = "selectedAction" | "context" | "visible" | "conflicts";
export declare function KeybindingEditor({ registry, profile, onProfileChange, compiledRegistry, presentation, className, }: KeybindingEditorProps): import("react").JSX.Element;
export interface KeyboardViewProps {
    bindings: readonly Binding[];
    conflicts?: readonly Conflict[];
    selectedActionId?: string;
    selectedBindingId?: string;
    scope?: KeyboardScope;
    context?: string;
    visibleActionIds?: readonly string[];
    pressedCodes?: ReadonlySet<string>;
    highlightedSequence?: readonly KeyStroke[];
    layoutLabels?: ReadonlyMap<string, string>;
    onKeyInspect?: (code: string, bindingIds: string[]) => void;
}
export declare function KeyboardView({ bindings, conflicts, selectedActionId, selectedBindingId, scope, context, visibleActionIds, pressedCodes, highlightedSequence, layoutLabels, onKeyInspect }: KeyboardViewProps): import("react").JSX.Element;
