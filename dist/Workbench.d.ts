import { type ActionRegistry, type Profile } from "@moritzbrantner/input-bindings";
import { type MobileControlsOverlay } from "./MobileControlsView.js";
import { type InputBindingsContextScenario } from "./workbench-model.js";
export type { InputBindingsContextScenario, InputBindingsKeyboardMode } from "./workbench-model.js";
export { createStarterMobileControlsOverlay, MobileControlsView, } from "./MobileControlsView.js";
export type { MobileControlKind, MobileControlsOrientation, MobileControlsOverlay, MobileControlsViewProps, MobileOverlayControl, } from "./MobileControlsView.js";
export type InputBindingsWorkbenchView = "bindings" | "conflicts" | "keyboard" | "preview";
export type InputBindingsWorkbenchMode = "shortcuts" | "conflicts" | "preview";
export type InputBindingsWorkbenchPresentation = "list" | "keyboard";
export interface InputBindingsWorkbenchProps {
    registry: ActionRegistry;
    profile: Profile;
    onProfileChange: (profile: Profile) => void;
    contextScenarios?: readonly InputBindingsContextScenario[];
    title?: string;
    description?: string;
    initialView?: InputBindingsWorkbenchView;
    initialMode?: InputBindingsWorkbenchMode;
    initialPresentation?: InputBindingsWorkbenchPresentation;
    mobileOverlay?: MobileControlsOverlay;
    onMobileOverlayChange?: (overlay: MobileControlsOverlay) => void;
    className?: string;
}
export declare function InputBindingsWorkbench({ registry, profile, onProfileChange, contextScenarios, title, description, initialView, initialMode, initialPresentation, mobileOverlay, onMobileOverlayChange, className, }: InputBindingsWorkbenchProps): import("react").JSX.Element;
