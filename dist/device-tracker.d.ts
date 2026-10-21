export type InputDeviceClass = "keyboardMouse" | "gamepad" | "touch";
export type DeviceEventTargetLike = {
    addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
    removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
};
export type ActiveDeviceTrackerOptions = {
    /** Receives keyboard, pointer and wheel events. Defaults to `window`. */
    target?: DeviceEventTargetLike;
    initial?: InputDeviceClass;
};
/**
 * Tracks the most recently used device class so consumers can show
 * device-matched prompts and switch without restarting. Keyboard, mouse,
 * pen and touch are observed from DOM events; gamepads report activity
 * through `attachGamepadRuntime({ deviceTracker })`.
 */
export type ActiveDeviceTracker = {
    readonly current: InputDeviceClass | null;
    markActive(device: InputDeviceClass): void;
    subscribe(listener: (device: InputDeviceClass) => void): () => void;
    detach(): void;
};
export declare function createActiveDeviceTracker(options?: ActiveDeviceTrackerOptions): ActiveDeviceTracker;
