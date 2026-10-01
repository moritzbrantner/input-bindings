import type { ActionRegistry } from "@moritzbrantner/input-bindings";
export type MobileControlKind = "stick" | "button" | "gestureZone" | "dock";
export type MobileControlsOrientation = "portrait" | "landscape";
export type MobileOverlayControl = {
    id: string;
    kind: MobileControlKind;
    label: string;
    actionId?: string | undefined;
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
export type MobileControlsViewProps = {
    registry: ActionRegistry;
    overlay: MobileControlsOverlay;
    onOverlayChange?: ((overlay: MobileControlsOverlay) => void) | undefined;
};
export declare function createStarterMobileControlsOverlay(): MobileControlsOverlay;
export declare function MobileControlsView({ registry, overlay, onOverlayChange, }: MobileControlsViewProps): import("react").JSX.Element;
