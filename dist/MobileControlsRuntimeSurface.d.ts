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
export type MobileControlsRuntimeSurfaceProps = {
    overlay: MobileControlsOverlay;
    onActionInput?: ((event: MobileActionInputEvent) => void) | undefined;
    onAnalogInput?: ((event: MobileAnalogInputEvent) => void) | undefined;
    className?: string | undefined;
};
export declare function MobileControlsRuntimeSurface({ overlay, onActionInput, onAnalogInput, className, }: MobileControlsRuntimeSurfaceProps): import("react").JSX.Element;
