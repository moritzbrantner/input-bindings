import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import { type MobileActionInputEvent, type MobileAnalogInputEvent, type MobileGestureRuntime } from "./MobileControlsRuntimeSurface.js";
export type MobileControlKind = "stick" | "button" | "gestureZone" | "dock";
export type MobileControlsOrientation = "portrait" | "landscape";
export type MobileOverlayControl = {
    id: string;
    kind: MobileControlKind;
    label: string;
    actionId?: string | undefined;
    analogActionId?: string | undefined;
    /**
     * Gesture zones only. When set, strokes that begin in the zone are recognized and resolved as
     * gesture bindings with this context active, instead of driving `analogActionId`.
     */
    gestureContext?: string | undefined;
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
    /** Runs gesture zones in Test mode through the shared gesture runtime. */
    gestureRuntime?: MobileGestureRuntime | undefined;
};
export declare function createStarterMobileControlsOverlay(): MobileControlsOverlay;
export declare function MobileControlsView({ registry, overlay, analogActions, onOverlayChange, onActionInput, onAnalogInput, gestureRuntime, }: MobileControlsViewProps): import("react").JSX.Element;
