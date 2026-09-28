export type KeyMatch = {
    kind: "logical";
    value: string;
} | {
    kind: "physical";
    value: string;
};
export interface Modifiers {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    altGraph?: boolean;
}
export interface KeyStroke {
    key: KeyMatch;
    modifiers?: Modifiers;
}
export interface MouseButtonStroke {
    device: "mouseButton";
    button: number;
    modifiers?: Modifiers;
}
export interface WheelStroke {
    device: "wheel";
    direction: "up" | "down" | "left" | "right";
    modifiers?: Modifiers;
}
export interface GamepadButtonStroke {
    device: "gamepadButton";
    button: number;
    threshold: number;
    gamepad?: number;
}
export interface GamepadAxisStroke {
    device: "gamepadAxis";
    axis: number;
    direction: "positive" | "negative";
    threshold: number;
    deadzone: number;
    gamepad?: number;
}
export type InputStroke = KeyStroke | MouseButtonStroke | WheelStroke | GamepadButtonStroke | GamepadAxisStroke;
export type InputDeviceClass = "keyboard" | "mouse" | "gamepad";
export type WhenExpr = {
    op: "always";
} | {
    op: "context";
    id: string;
} | {
    op: "not";
    expr: WhenExpr;
} | {
    op: "all";
    exprs: WhenExpr[];
} | {
    op: "any";
    exprs: WhenExpr[];
};
export interface Binding {
    id: string;
    action: string;
    sequence: InputStroke[];
    when?: WhenExpr;
    priority?: number;
}
export type Resolution = {
    kind: "none";
} | {
    kind: "resolved";
    bindingId: string;
    action: string;
} | {
    kind: "ambiguous";
    bindingIds: string[];
} | {
    kind: "pending";
    exactBindingIds: string[];
    continuationBindingIds: string[];
};
export type ConflictKind = "duplicate" | "ambiguousExact" | "overrideExact" | "chordPrefix" | "potentialExact" | "potentialPrefix";
export interface Conflict {
    leftBindingId: string;
    rightBindingId: string;
    kind: ConflictKind;
    witnessContexts?: string[];
}
export type BindingPatch = {
    op: "add";
    binding: Binding;
} | {
    op: "remove";
    bindingId: string;
} | {
    op: "replace";
    bindingId: string;
    binding: Binding;
};
export interface Profile {
    id: string;
    patches: BindingPatch[];
}
export type ProfileDiagnosticKind = "addCollision" | "missingBinding" | "replacementIdMismatch";
export interface ProfileDiagnostic {
    patchIndex: number;
    kind: ProfileDiagnosticKind;
    bindingId: string;
}
export interface ProfileApplication {
    bindings: Binding[];
    diagnostics: ProfileDiagnostic[];
}
export declare function isKeyStroke(stroke: InputStroke): stroke is KeyStroke;
export declare function inputDeviceClass(stroke: InputStroke): InputDeviceClass;
export declare function inputStrokeIdentity(stroke: InputStroke): string;
export declare function evaluateWhen(expression: WhenExpr | undefined, activeContexts: ReadonlySet<string>): boolean;
export declare function whenSpecificity(expression: WhenExpr | undefined): number;
export declare function resolve(bindings: readonly Binding[], sequence: readonly InputStroke[], activeContexts: ReadonlySet<string>): Resolution;
export declare function analyzeConflicts(bindings: readonly Binding[]): Conflict[];
export declare function applyProfile(base: readonly Binding[], profile: Profile): ProfileApplication;
export declare function inputStrokeEquals(left: InputStroke, right: InputStroke): boolean;
export declare function strokeEquals(left: InputStroke, right: InputStroke): boolean;
