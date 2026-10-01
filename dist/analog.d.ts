export type AnalogActionKind = "axis1D" | "axis2D";
export type AnalogDispatchReason = "update" | "release" | "reset";
export type Axis2D = {
    x: number;
    y: number;
};
export type AnalogActionDefinition = {
    id: string;
    kind: AnalogActionKind;
    title?: string | undefined;
};
export type AnalogAxis1DDispatch = {
    action: string;
    kind: "axis1D";
    value: number;
    sourceIds: string[];
    reason: AnalogDispatchReason;
};
export type AnalogAxis2DDispatch = {
    action: string;
    kind: "axis2D";
    value: Axis2D;
    sourceIds: string[];
    reason: AnalogDispatchReason;
};
export type AnalogDispatch = AnalogAxis1DDispatch | AnalogAxis2DDispatch;
export type AnalogInputControllerOptions = {
    actions: readonly AnalogActionDefinition[];
    onDispatch?: ((dispatch: AnalogDispatch) => void) | undefined;
};
/**
 * Routes continuous sources to semantic analog actions.
 *
 * This deliberately sits beside the discrete InputRuntimeController. Continuous
 * values are not synthesized into InputStroke values or chord semantics.
 * Multiple sources for the same action are combined in stable source-id order
 * and clamped to the normalized [-1, 1] range.
 */
export declare class AnalogInputController {
    private readonly actions;
    private readonly onDispatch;
    private readonly contributions;
    private readonly lastValues;
    constructor(options: AnalogInputControllerOptions);
    setAxis1D(sourceId: string, action: string, value: number): AnalogAxis1DDispatch | undefined;
    setAxis2D(sourceId: string, action: string, value: Axis2D): AnalogAxis2DDispatch | undefined;
    clearSource(sourceId: string, action?: string): AnalogDispatch[];
    reset(): AnalogDispatch[];
    value(action: string): number | Axis2D;
    private assertSourceId;
    private assertActionKind;
    private emitIfChanged;
    private aggregate;
}
export declare function normalizeAxis1D(value: number): number;
export declare function normalizeAxis2D(value: Axis2D): Axis2D;
export declare function applyAxis1DDeadzone(value: number, deadzone: number): number;
export declare function applyAxis2DDeadzone(value: Axis2D, deadzone: number): Axis2D;
export declare function scaleAxis1D(value: number, sensitivity: number): number;
export declare function scaleAxis2D(value: Axis2D, sensitivity: number): Axis2D;
export declare function smoothAxis1D(previous: number, next: number, response: number): number;
export declare function smoothAxis2D(previous: Axis2D, next: Axis2D, response: number): Axis2D;
export declare function rotateAxis2D(value: Axis2D, degrees: number): Axis2D;
