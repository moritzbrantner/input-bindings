import { inputStrokeIdentity, } from "@moritzbrantner/input-bindings";
const MODIFIER_ONLY_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);
const MODIFIER_ONLY_CODES = new Set([
    "Alt",
    "AltLeft",
    "AltRight",
    "Control",
    "ControlLeft",
    "ControlRight",
    "Meta",
    "MetaLeft",
    "MetaRight",
    "Shift",
    "ShiftLeft",
    "ShiftRight",
]);
export function isModifierOnlyKeyboardValue(value, mode = "logical") {
    return mode === "physical" ? MODIFIER_ONLY_CODES.has(value) : MODIFIER_ONLY_KEYS.has(value);
}
export function keyboardEventToStroke(event, options = {}) {
    const { mode = "logical", altGraph = "distinct", ignoreComposing = true, ignoreModifierOnly = true, respectDefaultPrevented = true, } = options;
    if (ignoreComposing && event.isComposing)
        return null;
    if (respectDefaultPrevented && event.defaultPrevented)
        return null;
    if (ignoreModifierOnly && isModifierOnlyKeyboardValue(event.key))
        return null;
    if (event.key === "Unidentified" || event.key === "Process")
        return null;
    const altGraphActive = event.getModifierState?.("AltGraph") ?? event.key === "AltGraph";
    const modifiers = {
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        altGraph: altGraphActive,
    };
    if (altGraphActive && altGraph === "distinct") {
        modifiers.ctrl = false;
        modifiers.alt = false;
    }
    return {
        key: mode === "physical"
            ? { kind: "physical", value: event.code }
            : { kind: "logical", value: normalizeLogicalKey(event.key) },
        modifiers,
    };
}
export function mouseEventToStroke(event) {
    if (event.defaultPrevented)
        return null;
    if (!Number.isInteger(event.button) || event.button < 0)
        return null;
    return {
        device: "mouseButton",
        button: event.button,
        modifiers: modifiersFromEvent(event),
    };
}
export function wheelEventToStroke(event) {
    if (event.defaultPrevented)
        return null;
    const horizontal = Math.abs(event.deltaX);
    const vertical = Math.abs(event.deltaY);
    if (horizontal === 0 && vertical === 0)
        return null;
    const direction = vertical >= horizontal
        ? event.deltaY < 0
            ? "up"
            : "down"
        : event.deltaX < 0
            ? "left"
            : "right";
    return {
        device: "wheel",
        direction,
        modifiers: modifiersFromEvent(event),
    };
}
export function normalizeLogicalKey(key) {
    if (key === " ")
        return "Space";
    if (key === "Esc")
        return "Escape";
    if (key.length === 1)
        return key.toLowerCase();
    return key;
}
export function isTextEntryTarget(target) {
    if (typeof target !== "object" || target === null)
        return false;
    const candidate = target;
    const tagName = candidate.tagName?.toUpperCase();
    if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT")
        return true;
    if (candidate.isContentEditable)
        return true;
    const role = candidate.role ?? candidate.getAttribute?.("role");
    return role === "textbox" || role === "searchbox" || role === "combobox";
}
export function attachKeyboardRuntime(controller, options = {}) {
    const globals = globalThis;
    const keyTarget = options.keyTarget ?? globals.window;
    if (!keyTarget) {
        throw new Error("attachKeyboardRuntime requires a keyTarget outside a browser environment");
    }
    const focusTarget = options.focusTarget ?? globals.window;
    const visibilityTarget = options.visibilityTarget ?? globals.document;
    const ignoreTextEntry = options.ignoreTextEntry ?? false;
    const resetOnBlur = options.resetOnBlur ?? true;
    const resetOnHidden = options.resetOnHidden ?? true;
    const resetOnDetach = options.resetOnDetach ?? true;
    const pressedStrokes = new Map();
    const applyConsumption = (event, decision) => {
        if (!decision.consumed)
            return;
        event.preventDefault?.();
        if (options.stopPropagation)
            event.stopPropagation?.();
    };
    const currentMode = () => typeof options.mode === "function" ? options.mode() : (options.mode ?? "logical");
    const normalize = (event, overrides = {}) => keyboardEventToStroke(event, {
        ...options.keyboardOptions,
        mode: currentMode(),
        ...overrides,
    });
    const eventIdentity = (event) => event.code || event.key;
    const onKeyDown = (rawEvent) => {
        const event = rawEvent;
        if (ignoreTextEntry && isTextEntryTarget(event.target))
            return;
        const identity = eventIdentity(event);
        const existingStroke = pressedStrokes.get(identity);
        const stroke = existingStroke ?? normalize(event);
        if (!stroke)
            return;
        if (!existingStroke)
            pressedStrokes.set(identity, structuredClone(stroke));
        const decision = controller.handleKeyDown(stroke, { repeat: Boolean(event.repeat) });
        applyConsumption(event, decision);
    };
    const onKeyUp = (rawEvent) => {
        const event = rawEvent;
        const identity = eventIdentity(event);
        const storedStroke = pressedStrokes.get(identity);
        pressedStrokes.delete(identity);
        const stroke = storedStroke ??
            normalize(event, {
                ignoreComposing: false,
                respectDefaultPrevented: false,
            });
        if (!stroke)
            return;
        const decision = controller.handleKeyUp(stroke);
        applyConsumption(event, decision);
    };
    const reset = (reason) => {
        pressedStrokes.clear();
        controller.reset(reason);
    };
    const onBlur = () => {
        if (resetOnBlur)
            reset("blur");
    };
    const onVisibilityChange = () => {
        if (resetOnHidden &&
            (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden")) {
            reset("hidden");
        }
    };
    keyTarget.addEventListener("keydown", onKeyDown);
    keyTarget.addEventListener("keyup", onKeyUp);
    focusTarget?.addEventListener("blur", onBlur);
    visibilityTarget?.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
        keyTarget.removeEventListener("keydown", onKeyDown);
        keyTarget.removeEventListener("keyup", onKeyUp);
        focusTarget?.removeEventListener("blur", onBlur);
        visibilityTarget?.removeEventListener("visibilitychange", onVisibilityChange);
        pressedStrokes.clear();
        if (resetOnDetach)
            controller.reset("detached");
    };
}
export function attachMouseRuntime(controller, options = {}) {
    const globals = globalThis;
    const target = options.target ?? globals.window;
    if (!target) {
        throw new Error("attachMouseRuntime requires a target outside a browser environment");
    }
    const ignoreTextEntry = options.ignoreTextEntry ?? false;
    const resetOnDetach = options.resetOnDetach ?? true;
    const pressed = new Map();
    const applyConsumption = (event, decision) => {
        if (!decision.consumed)
            return;
        event.preventDefault?.();
        if (options.stopPropagation)
            event.stopPropagation?.();
    };
    const onMouseDown = (rawEvent) => {
        const event = rawEvent;
        if (ignoreTextEntry && isTextEntryTarget(event.target))
            return;
        if ((options.respectDefaultPrevented ?? true) && event.defaultPrevented)
            return;
        const stroke = mouseEventToStroke({ ...event, defaultPrevented: false });
        if (!stroke)
            return;
        pressed.set(event.button, structuredClone(stroke));
        applyConsumption(event, controller.handleInputDown(stroke));
    };
    const onMouseUp = (rawEvent) => {
        const event = rawEvent;
        const stroke = pressed.get(event.button) ?? mouseEventToStroke({ ...event, defaultPrevented: false });
        pressed.delete(event.button);
        if (!stroke)
            return;
        applyConsumption(event, controller.handleInputUp(stroke));
    };
    const onWheel = (rawEvent) => {
        const event = rawEvent;
        if (ignoreTextEntry && isTextEntryTarget(event.target))
            return;
        if ((options.respectDefaultPrevented ?? true) && event.defaultPrevented)
            return;
        const stroke = wheelEventToStroke({ ...event, defaultPrevented: false });
        if (!stroke)
            return;
        const down = controller.handleInputDown(stroke);
        controller.handleInputUp(stroke);
        applyConsumption(event, down);
    };
    target.addEventListener("mousedown", onMouseDown);
    target.addEventListener("mouseup", onMouseUp);
    target.addEventListener("wheel", onWheel, { passive: false });
    return () => {
        target.removeEventListener("mousedown", onMouseDown);
        target.removeEventListener("mouseup", onMouseUp);
        target.removeEventListener("wheel", onWheel, { passive: false });
        pressed.clear();
        if (resetOnDetach)
            controller.reset("mouseDetached");
    };
}
export function attachGamepadRuntime(controller, options = {}) {
    const globals = globalThis;
    const getGamepads = options.getGamepads ?? (() => globals.navigator?.getGamepads?.() ?? []);
    const scheduler = options.scheduler ?? defaultFrameScheduler(globals);
    const resetOnDetach = options.resetOnDetach ?? true;
    const triggers = gamepadTriggers(controller.effectiveBindings);
    const active = new Map();
    let stopped = false;
    let frame;
    const poll = () => {
        if (stopped)
            return;
        const gamepads = getGamepads();
        for (const trigger of triggers) {
            const identity = inputStrokeIdentity(trigger);
            const isActive = active.has(identity);
            const nextActive = gamepadStrokeActive(trigger, gamepads, isActive);
            if (!isActive && nextActive) {
                active.set(identity, structuredClone(trigger));
                controller.handleInputDown(trigger);
            }
            else if (isActive && !nextActive) {
                const stored = active.get(identity);
                active.delete(identity);
                if (stored)
                    controller.handleInputUp(stored);
            }
        }
        frame = scheduler.requestFrame(poll);
    };
    frame = scheduler.requestFrame(poll);
    return () => {
        stopped = true;
        if (frame !== undefined)
            scheduler.cancelFrame(frame);
        for (const stroke of active.values())
            controller.handleInputUp(stroke);
        active.clear();
        if (resetOnDetach)
            controller.reset("gamepadDetached");
    };
}
export function gamepadStrokeActive(stroke, gamepads, wasActive = false) {
    const candidates = gamepads.filter((gamepad) => gamepad !== null &&
        gamepad.connected !== false &&
        (stroke.gamepad === undefined || gamepad.index === stroke.gamepad));
    if (stroke.device === "gamepadButton") {
        return candidates.some((gamepad) => {
            const button = gamepad.buttons[stroke.button];
            return Boolean(button) && (button.pressed === true || button.value * 100 >= stroke.threshold);
        });
    }
    return candidates.some((gamepad) => {
        const value = gamepad.axes[stroke.axis];
        if (!Number.isFinite(value))
            return false;
        const signMatches = stroke.direction === "positive" ? value > 0 : value < 0;
        if (!signMatches)
            return false;
        const magnitude = Math.abs(value) * 100;
        return wasActive ? magnitude > stroke.deadzone : magnitude >= stroke.threshold;
    });
}
function gamepadTriggers(bindings) {
    const result = new Map();
    for (const binding of bindings) {
        for (const stroke of binding.sequence) {
            if ("device" in stroke && (stroke.device === "gamepadButton" || stroke.device === "gamepadAxis")) {
                result.set(inputStrokeIdentity(stroke), structuredClone(stroke));
            }
        }
    }
    return [...result.values()].sort((left, right) => inputStrokeIdentity(left).localeCompare(inputStrokeIdentity(right)));
}
function defaultFrameScheduler(globals) {
    if (globals.requestAnimationFrame && globals.cancelAnimationFrame) {
        return {
            requestFrame: (callback) => globals.requestAnimationFrame(callback),
            cancelFrame: (handle) => globals.cancelAnimationFrame(handle),
        };
    }
    return {
        requestFrame: (callback) => globalThis.setTimeout(callback, 16),
        cancelFrame: (handle) => globalThis.clearTimeout(handle),
    };
}
function modifiersFromEvent(event) {
    const altGraph = event.getModifierState?.("AltGraph") ?? false;
    return {
        ctrl: altGraph ? false : event.ctrlKey,
        alt: altGraph ? false : event.altKey,
        shift: event.shiftKey,
        meta: event.metaKey,
        altGraph,
    };
}
