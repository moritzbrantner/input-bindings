import type { GestureMatch } from "@moritzbrantner/input-bindings";
import type { GestureTraceAnalysisOptions, InputRuntimeController, PointerStrokeCancelReason, PointerStrokePhase, RuntimeDecision } from "@moritzbrantner/input-bindings-runtime";
import type { MobileControlsOverlay } from "./MobileControlsView.js";
export type MobileAxis2D = {
    x: number;
    y: number;
};
export type MobileActionInputEvent = {
    controlId: string;
    action: string;
    phase: "press" | "release";
};
export type MobileAnalogInputEvent = {
    controlId: string;
    action: string;
    phase: "update" | "release";
    value: MobileAxis2D;
};
export type MobileGestureStrokeEvent = {
    controlId: string;
    phase: PointerStrokePhase;
    cancelReason?: PointerStrokeCancelReason;
};
export type MobileGestureInputEvent = {
    controlId: string;
    context: string;
    matches: readonly GestureMatch[];
    decision: RuntimeDecision;
};
/** Connects gesture zones to the same recognizer and runtime used by unrestricted surfaces. */
export type MobileGestureRuntime = {
    controller: InputRuntimeController;
    recognition?: GestureTraceAnalysisOptions | undefined;
    onStroke?: ((event: MobileGestureStrokeEvent) => void) | undefined;
    onGesture?: ((event: MobileGestureInputEvent) => void) | undefined;
};
export type MobileControlsRuntimeSurfaceProps = {
    overlay: MobileControlsOverlay;
    onActionInput?: ((event: MobileActionInputEvent) => void) | undefined;
    onAnalogInput?: ((event: MobileAnalogInputEvent) => void) | undefined;
    /** Required for gesture zones (`gestureContext`); without it they stay inert. */
    gestureRuntime?: MobileGestureRuntime | undefined;
    className?: string | undefined;
};
export declare function MobileControlsRuntimeSurface({ overlay, onActionInput, onAnalogInput, gestureRuntime, className, }: MobileControlsRuntimeSurfaceProps): import("react").JSX.Element;
