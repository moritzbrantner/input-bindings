export function createActiveDeviceTracker(options = {}) {
    const target = options.target ?? globalThis.window;
    const listeners = new Set();
    let current = options.initial ?? null;
    const markActive = (device) => {
        if (device === current) {
            return;
        }
        current = device;
        for (const listener of [...listeners]) {
            listener(device);
        }
    };
    const onKeyboardMouse = () => markActive("keyboardMouse");
    const onPointerDown = (event) => markActive(event.pointerType === "touch" ? "touch" : "keyboardMouse");
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
