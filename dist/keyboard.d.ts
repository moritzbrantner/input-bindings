import { type Binding, type InputStroke, type KeyStroke } from "@moritzbrantner/input-bindings";
export type KeyboardKeyDefinition = {
    code: string;
    label: string;
    width?: number;
};
export declare const KEYBOARD_ROWS: readonly (readonly KeyboardKeyDefinition[])[];
export declare function keyboardLabelForCode(code: string, layoutLabels?: ReadonlyMap<string, string>): string;
export declare function codeForStroke(stroke: KeyStroke, layoutLabels?: ReadonlyMap<string, string>): string | undefined;
export declare function codesForStroke(stroke: KeyStroke, layoutLabels?: ReadonlyMap<string, string>): string[];
export declare function codesForSequence(sequence: readonly InputStroke[], layoutLabels?: ReadonlyMap<string, string>): string[];
export type KeyboardBindingIndex = ReadonlyMap<string, readonly string[]>;
export declare function createKeyboardBindingIndex(bindings: readonly Binding[], layoutLabels?: ReadonlyMap<string, string>): KeyboardBindingIndex;
export declare function bindingUsesCode(binding: Binding, code: string, layoutLabels?: ReadonlyMap<string, string>): boolean;
export declare function bindingIdsForCode(bindings: readonly Binding[], code: string, layoutLabels?: ReadonlyMap<string, string>): string[];
