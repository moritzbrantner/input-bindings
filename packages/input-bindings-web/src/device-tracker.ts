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

export function createActiveDeviceTracker(
  options: ActiveDeviceTrackerOptions = {},
): ActiveDeviceTracker {
  const target = options.target ?? (globalThis as { window?: DeviceEventTargetLike }).window;
  const listeners = new Set<(device: InputDeviceClass) => void>();
  let current: InputDeviceClass | null = options.initial ?? null;

  const markActive = (device: InputDeviceClass) => {
    if (device === current) {
      return;
    }
    current = device;
    for (const listener of [...listeners]) {
      listener(device);
    }
  };

  const onKeyboardMouse = () => markActive("keyboardMouse");
  const onPointerDown = (event: { pointerType?: string }) =>
    markActive(event.pointerType === "touch" ? "touch" : "keyboardMouse");

  const capture = { capture: true, passive: true };
  target?.addEventListener("keydown", onKeyboardMouse, capture);
  target?.addEventListener("wheel", onKeyboardMouse, capture);
  target?.addEventListener("pointerdown", onPointerDown, capture);

  return {
    get current() {
      return current;
    },
    markActive,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    detach() {
      target?.removeEventListener("keydown", onKeyboardMouse, capture);
      target?.removeEventListener("wheel", onKeyboardMouse, capture);
      target?.removeEventListener("pointerdown", onPointerDown, capture);
      listeners.clear();
    },
  };
}
