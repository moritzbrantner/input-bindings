export type KeyMatch = {
    kind: "logical";
    value: string;
} | {
    kind: "physical";
    value: string;
};
export type Modifiers = {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
    altGraph?: boolean;
};
export type KeyStroke = {
    key: KeyMatch;
    modifiers?: Modifiers;
};
export type MouseButtonStroke = {
    device: "mouseButton";
    button: number;
    modifiers?: Modifiers;
};
export type WheelStroke = {
    device: "wheel";
    direction: "up" | "down" | "left" | "right";
    modifiers?: Modifiers;
};
export type GamepadButtonStroke = {
    device: "gamepadButton";
    button: number;
    threshold: number;
    gamepad?: number;
};
export type GamepadAxisStroke = {
    device: "gamepadAxis";
    axis: number;
    direction: "positive" | "negative";
    threshold: number;
    deadzone: number;
    gamepad?: number;
};
/** Eight-way screen direction; north is up on screen. */
export type CompassDirection = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type GestureOrientation = "clockwise" | "counterClockwise";
/**
 * A recognized pointer gesture, or a binding pattern for one. In a binding, an omitted direction
 * or orientation matches any value; a recognizer reports the concrete value.
 */
export type GestureMatch = {
    kind: "tap";
} | {
    kind: "hold";
} | {
    kind: "drag";
    direction?: CompassDirection;
} | {
    kind: "swipe";
    direction?: CompassDirection;
} | {
    kind: "slash";
    direction?: CompassDirection;
} | {
    kind: "circle";
    orientation?: GestureOrientation;
} | {
    kind: "symbol";
    id: string;
};
/** A completed pointer gesture. Gestures are event-like and must be a binding's only stroke. */
export type GestureStroke = {
    device: "gesture";
    gesture: GestureMatch;
};
export type InputStroke = KeyStroke | MouseButtonStroke | WheelStroke | GamepadButtonStroke | GamepadAxisStroke | GestureStroke;
export type InputDeviceClass = "keyboard" | "mouse" | "gamepad" | "pointer";
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
export type Binding = {
    id: string;
    action: string;
    sequence: InputStroke[];
    when?: WhenExpr;
    priority?: number;
};
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
export type Conflict = {
    leftBindingId: string;
    rightBindingId: string;
    kind: ConflictKind;
    witnessContexts?: string[];
};
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
export type Profile = {
    id: string;
    patches: BindingPatch[];
};
export type ProfileDiagnosticKind = "addCollision" | "missingBinding" | "replacementIdMismatch";
export type ProfileDiagnostic = {
    patchIndex: number;
    kind: ProfileDiagnosticKind;
    bindingId: string;
};
export type ProfileApplication = {
    bindings: Binding[];
    diagnostics: ProfileDiagnostic[];
};
export declare function isKeyStroke(stroke: InputStroke): stroke is KeyStroke;
export declare function inputDeviceClass(stroke: InputStroke): InputDeviceClass;
export declare function isGestureStroke(stroke: InputStroke): stroke is GestureStroke;
export declare function gestureMatchIdentity(gesture: GestureMatch): string;
export declare function gestureMatchEquals(left: GestureMatch, right: GestureMatch): boolean;
export declare function inputStrokeIdentity(stroke: InputStroke): string;
export declare function evaluateWhen(expression: WhenExpr | undefined, activeContexts: ReadonlySet<string>): boolean;
export declare function whenSpecificity(expression: WhenExpr | undefined): number;
export declare function resolve(bindings: readonly Binding[], sequence: readonly InputStroke[], activeContexts: ReadonlySet<string>): Resolution;
export declare function analyzeConflicts(bindings: readonly Binding[]): Conflict[];
export declare function applyProfile(base: readonly Binding[], profile: Profile): ProfileApplication;
export declare function inputStrokeEquals(left: InputStroke, right: InputStroke): boolean;
export declare function strokeEquals(left: InputStroke, right: InputStroke): boolean;
