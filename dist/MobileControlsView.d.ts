import type { ActionRegistry } from "@moritzbrantner/input-bindings";
export type MobileControlKind = "stick" | "button" | "gestureZone" | "dock";
export type MobileControlsOrientation = "portrait" | "landscape";
export interface MobileOverlayControl {
    id: string;
    kind: MobileControlKind;
    label: string;
    actionId?: string;
    /** Left edge as a percentage of the preview surface. */
    x: number;
    /** Top edge as a percentage of the preview surface. */
    y: number;
    /** Width as a percentage of the preview surface. */
    width: number;
    /** Height as a percentage of the preview surface. */
    height: number;
}
export interface MobileControlsOverlay {
    orientation: MobileControlsOrientation;
    controls: readonly MobileOverlayControl[];
}
export interface MobileControlsViewProps {
    registry: ActionRegistry;
    overlay: MobileControlsOverlay;
    onOverlayChange?: (overlay: MobileControlsOverlay) => void;
}
export declare function createStarterMobileControlsOverlay(): MobileControlsOverlay;
export declare function MobileControlsView({ registry, overlay, onOverlayChange, }: MobileControlsViewProps): import("react").JSX.Element;
