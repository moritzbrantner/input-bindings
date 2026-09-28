import { type GamepadAxisStroke, type GamepadButtonStroke, type KeyStroke, type MouseButtonStroke, type WheelStroke } from "@moritzbrantner/input-bindings";
import type { InputRuntimeController } from "@moritzbrantner/input-bindings-runtime";
export interface KeyboardEventLike {
    key: string;
    code: string;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    isComposing?: boolean;
    defaultPrevented?: boolean;
    getModifierState?: (key: string) => boolean;
}
export interface KeyboardAdapterOptions {
    mode?: "logical" | "physical";
    altGraph?: "distinct" | "ctrlAlt";
    ignoreComposing?: boolean;
    ignoreModifierOnly?: boolean;
    respectDefaultPrevented?: boolean;
}
export interface RuntimeKeyboardEventLike extends KeyboardEventLike {
    repeat?: boolean;
    target?: unknown;
    preventDefault?: () => void;
    stopPropagation?: () => void;
}
export interface PointerEventLike {
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
}
export interface WheelEventLike {
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
}
export interface RuntimeEventTargetLike {
    addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
    removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
}
export interface VisibilityEventTargetLike extends RuntimeEventTargetLike {
    hidden?: boolean;
    visibilityState?: string;
}
export interface BrowserRuntimeAdapterOptions {
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
}
export interface MouseRuntimeAdapterOptions {
    target?: RuntimeEventTargetLike;
    ignoreTextEntry?: boolean;
    stopPropagation?: boolean;
    respectDefaultPrevented?: boolean;
    resetOnDetach?: boolean;
}
export interface GamepadButtonLike {
    pressed?: boolean;
    value: number;
}
export interface GamepadLike {
    index: number;
    connected?: boolean;
    buttons: readonly GamepadButtonLike[];
    axes: readonly number[];
}
export interface FrameScheduler {
    requestFrame(callback: () => void): unknown;
    cancelFrame(handle: unknown): void;
}
export interface GamepadRuntimeAdapterOptions {
    getGamepads?: () => readonly (GamepadLike | null)[];
    scheduler?: FrameScheduler;
    resetOnDetach?: boolean;
}
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
