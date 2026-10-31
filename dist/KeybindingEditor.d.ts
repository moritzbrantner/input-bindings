import { type ActionRegistry, type CompiledActionRegistry, type Profile } from "@moritzbrantner/input-bindings";
export type KeybindingEditorPresentation = "split" | "list" | "keyboard";
export type KeybindingEditorProps = {
    registry: ActionRegistry;
    profile: Profile;
    onProfileChange: (profile: Profile) => void;
    compiledRegistry?: CompiledActionRegistry;
    presentation?: KeybindingEditorPresentation;
    className?: string;
};
export declare function KeybindingEditor({ registry, profile, onProfileChange, compiledRegistry, presentation, className, }: KeybindingEditorProps): import("react").JSX.Element;
