export * from "./analog.js";
export * from "./device-tracker.js";
export * from "./gesture-runtime.js";
export * from "./multi-pointer.js";
export * from "./pointer-stroke.js";
import { type GamepadAxisStroke, type GamepadButtonStroke, type KeyStroke, type MouseButtonStroke, type WheelStroke } from "@moritzbrantner/input-bindings";
import { type AnalogInputController, type InputRuntimeController } from "@moritzbrantner/input-bindings-runtime";
import type { ActiveDeviceTracker } from "./device-tracker.js";
export type KeyboardEventLike = {
    key: string;
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    isComposing?: boolean;
    defaultPrevented?: boolean;
    getModifierState?: (key: string) => boolean;
};
export type KeyboardAdapterOptions = {
    mode?: "logical" | "physical";
    altGraph?: "distinct" | "ctrlAlt";
    ignoreComposing?: boolean;
    ignoreModifierOnly?: boolean;
    respectDefaultPrevented?: boolean;
};
export type RuntimeKeyboardEventLike = {
    repeat?: boolean;
    target?: unknown;
    preventDefault?: () => void;
    stopPropagation?: () => void;
} & KeyboardEventLike;
export type PointerEventLike = {
    button: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    defaultPrevented?: boolean;
    target?: unknown;
    getModifierState?: (key: string) => boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
};
export type WheelEventLike = {
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    defaultPrevented?: boolean;
    target?: unknown;
    getModifierState?: (key: string) => boolean;
    preventDefault?: () => void;
    stopPropagation?: () => void;
};
export type RuntimeEventTargetLike = {
    addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
    removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
};
export type VisibilityEventTargetLike = {
    hidden?: boolean;
    visibilityState?: string;
} & RuntimeEventTargetLike;
export type BrowserRuntimeAdapterOptions = {
    keyTarget?: RuntimeEventTargetLike;
    focusTarget?: RuntimeEventTargetLike;
    visibilityTarget?: VisibilityEventTargetLike;
    mode?: "logical" | "physical" | (() => "logical" | "physical");
    keyboardOptions?: Omit<KeyboardAdapterOptions, "mode">;
    ignoreTextEntry?: boolean;
    stopPropagation?: boolean;
    resetOnBlur?: boolean;
    resetOnHidden?: boolean;
    resetOnDetach?: boolean;
};
export type MouseRuntimeAdapterOptions = {
    target?: RuntimeEventTargetLike;
    ignoreTextEntry?: boolean;
    stopPropagation?: boolean;
    respectDefaultPrevented?: boolean;
    resetOnDetach?: boolean;
};
export type GamepadButtonLike = {
    pressed?: boolean;
    value: number;
};
export type GamepadLike = {
    index: number;
    connected?: boolean;
    buttons: readonly GamepadButtonLike[];
    axes: readonly number[];
};
export type FrameScheduler = {
    requestFrame(callback: () => void): unknown;
    cancelFrame(handle: unknown): void;
};
export type GamepadAnalogBinding = {
    /** Analog action id registered on the `AnalogInputController`. */
    action: string;
    /** Restrict to one pad index; any connected pad contributes when omitted. */
    gamepad?: number;
    /** Radial (axis2D) or axial (axis1D) dead zone in the normalized 0..1 range. Defaults to 0.15. */
    deadzone?: number;
} & ({
    axis: number;
} | {
    xAxis: number;
    yAxis: number;
    invertY?: boolean;
});
export type GamepadRuntimeAdapterOptions = {
    getGamepads?: () => readonly (GamepadLike | null)[];
    scheduler?: FrameScheduler;
    /** Receives `gamepadconnected`/`gamepaddisconnected`. Defaults to `window`. */
    eventTarget?: RuntimeEventTargetLike;
    /** Continuous stick/trigger axes routed to analog actions, one source per pad. */
    analog?: {
        controller: AnalogInputController;
        bindings: readonly GamepadAnalogBinding[];
    };
    /** Marked `gamepad` whenever a pad button or axis moves past the activity threshold. */
    deviceTracker?: Pick<ActiveDeviceTracker, "markActive">;
    resetOnDetach?: boolean;
};
export declare function isModifierOnlyKeyboardValue(value: string, mode?: "logical" | "physical"): boolean;
export declare function keyboardEventToStroke(event: KeyboardEventLike, options?: KeyboardAdapterOptions): KeyStroke | null;
export declare function mouseEventToStroke(event: PointerEventLike): MouseButtonStroke | null;
export declare function wheelEventToStroke(event: WheelEventLike): WheelStroke | null;
export declare function normalizeLogicalKey(key: string): string;
export declare function isTextEntryTarget(target: unknown): boolean;
export declare function attachKeyboardRuntime(controller: InputRuntimeController, options?: BrowserRuntimeAdapterOptions): () => void;
export declare function attachMouseRuntime(controller: InputRuntimeController, options?: MouseRuntimeAdapterOptions): () => void;
export declare function attachGamepadRuntime(controller: InputRuntimeController, options?: GamepadRuntimeAdapterOptions): () => void;
export declare function gamepadStrokeActive(stroke: GamepadButtonStroke | GamepadAxisStroke, gamepads: readonly (GamepadLike | null)[], wasActive?: boolean): boolean;
