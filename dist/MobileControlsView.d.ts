import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import { type MobileActionInputEvent, type MobileAnalogInputEvent } from "./MobileControlsRuntimeSurface.js";
export type MobileControlKind = "stick" | "button" | "gestureZone" | "dock";
export type MobileControlsOrientation = "portrait" | "landscape";
export type MobileOverlayControl = {
    id: string;
    kind: MobileControlKind;
    label: string;
    actionId?: string | undefined;
    analogActionId?: string | undefined;
    /** Left edge as a percentage of the preview surface. */
    x: number;
    /** Top edge as a percentage of the preview surface. */
    y: number;
    /** Width as a percentage of the preview surface. */
    width: number;
    /** Height as a percentage of the preview surface. */
    height: number;
};
export type MobileControlsOverlay = {
    orientation: MobileControlsOrientation;
    controls: readonly MobileOverlayControl[];
};
export type MobileAnalogActionOption = {
    id: string;
    title: string;
};
export type MobileControlsViewProps = {
    registry: ActionRegistry;
    overlay: MobileControlsOverlay;
    analogActions?: readonly MobileAnalogActionOption[] | undefined;
    onOverlayChange?: ((overlay: MobileControlsOverlay) => void) | undefined;
    onActionInput?: ((event: MobileActionInputEvent) => void) | undefined;
    onAnalogInput?: ((event: MobileAnalogInputEvent) => void) | undefined;
};
export declare function createStarterMobileControlsOverlay(): MobileControlsOverlay;
export declare function MobileControlsView({ registry, overlay, analogActions, onOverlayChange, onActionInput, onAnalogInput, }: MobileControlsViewProps): import("react").JSX.Element;
