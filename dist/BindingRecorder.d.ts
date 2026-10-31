import { type Binding, type Conflict, type KeyStroke } from "@moritzbrantner/input-bindings";
export declare function BindingRecorder({ title, initialSequence, allBindings, allConflicts, actionId, existingBinding, layoutLabels, onSave, onCancel, }: {
    title: string;
    initialSequence: readonly KeyStroke[];
    allBindings: readonly Binding[];
    allConflicts: readonly Conflict[];
    actionId?: string;
    existingBinding?: Binding | undefined;
    layoutLabels?: ReadonlyMap<string, string> | undefined;
    onSave: (sequence: KeyStroke[]) => void;
    onCancel: () => void;
}): import("react").JSX.Element;
