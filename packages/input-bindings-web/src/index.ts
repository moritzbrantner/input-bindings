export * from "./analog.ts";
export * from "./device-tracker.ts";
export * from "./gesture-runtime.ts";
export * from "./multi-pointer.ts";
export * from "./pointer-stroke.ts";

import {
  inputStrokeIdentity,
  type GamepadAxisStroke,
  type GamepadButtonStroke,
  type InputStroke,
  type KeyStroke,
  type Modifiers,
  type MouseButtonStroke,
  type WheelStroke,
} from "@moritzbrantner/input-bindings";
import {
  applyAxis1DDeadzone,
  applyAxis2DDeadzone,
  type AnalogInputController,
  type InputRuntimeController,
  type RuntimeDecision,
} from "@moritzbrantner/input-bindings-runtime";

import type { ActiveDeviceTracker } from "./device-tracker.ts";

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
} & ({ axis: number } | { xAxis: number; yAxis: number; invertY?: boolean });

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

const GAMEPAD_ACTIVITY_THRESHOLD = 0.5;
const DEFAULT_GAMEPAD_DEADZONE = 0.15;

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

export function isModifierOnlyKeyboardValue(
  value: string,
  mode: "logical" | "physical" = "logical",
): boolean {
  return mode === "physical" ? MODIFIER_ONLY_CODES.has(value) : MODIFIER_ONLY_KEYS.has(value);
}

export function keyboardEventToStroke(
  event: KeyboardEventLike,
  options: KeyboardAdapterOptions = {},
): KeyStroke | null {
  const {
    mode = "logical",
    altGraph = "distinct",
    ignoreComposing = true,
    ignoreModifierOnly = true,
    respectDefaultPrevented = true,
  } = options;

  if (ignoreComposing && event.isComposing) {
    return null;
  }
  if (respectDefaultPrevented && event.defaultPrevented) {
    return null;
  }
  if (ignoreModifierOnly && isModifierOnlyKeyboardValue(event.key)) {
    return null;
  }
  if (event.key === "Unidentified" || event.key === "Process") {
    return null;
  }

  const altGraphActive = event.getModifierState?.("AltGraph") ?? event.key === "AltGraph";
  const modifiers: Modifiers = {
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
    key:
      mode === "physical"
        ? { kind: "physical", value: event.code }
        : { kind: "logical", value: normalizeLogicalKey(event.key) },
    modifiers,
  };
}

export function mouseEventToStroke(event: PointerEventLike): MouseButtonStroke | null {
  if (event.defaultPrevented) {
    return null;
  }
  if (!Number.isInteger(event.button) || event.button < 0) {
    return null;
  }
  return {
    device: "mouseButton",
    button: event.button,
    modifiers: modifiersFromEvent(event),
  };
}

export function wheelEventToStroke(event: WheelEventLike): WheelStroke | null {
  if (event.defaultPrevented) {
    return null;
  }
  const horizontal = Math.abs(event.deltaX);
  const vertical = Math.abs(event.deltaY);
  if (horizontal === 0 && vertical === 0) {
    return null;
  }
  let direction: WheelStroke["direction"];
  if (vertical >= horizontal) {
    direction = event.deltaY < 0 ? "up" : "down";
  } else {
    direction = event.deltaX < 0 ? "left" : "right";
  }
  return {
    device: "wheel",
    direction,
    modifiers: modifiersFromEvent(event),
  };
}

export function normalizeLogicalKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key === "Esc") {
    return "Escape";
  }
  if (key.length === 1) {
    return key.toLowerCase();
  }
  return key;
}

export function isTextEntryTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) {
    return false;
  }

  const candidate = target as {
    tagName?: string;
    isContentEditable?: boolean;
    role?: string | null;
    getAttribute?: (name: string) => string | null;
  };
  const tagName = candidate.tagName?.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (candidate.isContentEditable) {
    return true;
  }
  const role = candidate.role ?? candidate.getAttribute?.("role");
  return role === "textbox" || role === "searchbox" || role === "combobox";
}

export function attachKeyboardRuntime(
  controller: InputRuntimeController,
  options: BrowserRuntimeAdapterOptions = {},
): () => void {
  const globals = globalThis as unknown as {
    window?: RuntimeEventTargetLike;
    document?: VisibilityEventTargetLike;
  };
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
  const pressedStrokes = new Map<string, KeyStroke>();

  const applyConsumption = (event: RuntimeKeyboardEventLike, decision: RuntimeDecision) => {
    if (!decision.consumed) {
      return;
    }
    event.preventDefault?.();
    if (options.stopPropagation) {
      event.stopPropagation?.();
    }
  };

  const currentMode = () =>
    typeof options.mode === "function" ? options.mode() : (options.mode ?? "logical");

  const normalize = (
    event: RuntimeKeyboardEventLike,
    overrides: Partial<KeyboardAdapterOptions> = {},
  ) =>
    keyboardEventToStroke(event, {
      ...options.keyboardOptions,
      mode: currentMode(),
      ...overrides,
    });

  const eventIdentity = (event: RuntimeKeyboardEventLike) => event.code || event.key;

  const onKeyDown = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    if (ignoreTextEntry && isTextEntryTarget(event.target)) {
      return;
    }

    const identity = eventIdentity(event);
    const existingStroke = pressedStrokes.get(identity);
    const stroke = existingStroke ?? normalize(event);
    if (!stroke) {
      return;
    }
    if (!existingStroke) {
      pressedStrokes.set(identity, structuredClone(stroke));
    }

    const decision = controller.handleKeyDown(stroke, { repeat: Boolean(event.repeat) });
    applyConsumption(event, decision);
  };

  const onKeyUp = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    const identity = eventIdentity(event);
    const storedStroke = pressedStrokes.get(identity);
    pressedStrokes.delete(identity);
    const stroke =
      storedStroke ??
      normalize(event, {
        ignoreComposing: false,
        respectDefaultPrevented: false,
      });
    if (!stroke) {
      return;
    }
    const decision = controller.handleKeyUp(stroke);
    applyConsumption(event, decision);
  };

  const reset = (reason: string) => {
    pressedStrokes.clear();
    controller.reset(reason);
  };

  const onBlur = () => {
    if (resetOnBlur) {
      reset("blur");
    }
  };

  const onVisibilityChange = () => {
    if (
      resetOnHidden &&
      (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden")
    ) {
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
    if (resetOnDetach) {
      controller.reset("detached");
    }
  };
}

export function attachMouseRuntime(
  controller: InputRuntimeController,
  options: MouseRuntimeAdapterOptions = {},
): () => void {
  const globals = globalThis as unknown as { window?: RuntimeEventTargetLike };
  const target = options.target ?? globals.window;
  if (!target) {
    throw new Error("attachMouseRuntime requires a target outside a browser environment");
  }
  const ignoreTextEntry = options.ignoreTextEntry ?? false;
  const resetOnDetach = options.resetOnDetach ?? true;
  const pressed = new Map<number, MouseButtonStroke>();

  const applyConsumption = (
    event: PointerEventLike | WheelEventLike,
    decision: RuntimeDecision,
  ) => {
    if (!decision.consumed) {
      return;
    }
    event.preventDefault?.();
    if (options.stopPropagation) {
      event.stopPropagation?.();
    }
  };

  const onMouseDown = (rawEvent: any) => {
    const event = rawEvent as PointerEventLike;
    if (ignoreTextEntry && isTextEntryTarget(event.target)) {
      return;
    }
    if ((options.respectDefaultPrevented ?? true) && event.defaultPrevented) {
      return;
    }
    const stroke = mouseEventToStroke({ ...event, defaultPrevented: false });
    if (!stroke) {
      return;
    }
    pressed.set(event.button, structuredClone(stroke));
    applyConsumption(event, controller.handleInputDown(stroke));
  };

  const onMouseUp = (rawEvent: any) => {
    const event = rawEvent as PointerEventLike;
    const stroke =
      pressed.get(event.button) ?? mouseEventToStroke({ ...event, defaultPrevented: false });
    pressed.delete(event.button);
    if (!stroke) {
      return;
    }
    applyConsumption(event, controller.handleInputUp(stroke));
  };

  const onWheel = (rawEvent: any) => {
    const event = rawEvent as WheelEventLike;
    if (ignoreTextEntry && isTextEntryTarget(event.target)) {
      return;
    }
    if ((options.respectDefaultPrevented ?? true) && event.defaultPrevented) {
      return;
    }
    const stroke = wheelEventToStroke({ ...event, defaultPrevented: false });
    if (!stroke) {
      return;
    }
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
    if (resetOnDetach) {
      controller.reset("mouseDetached");
    }
  };
}

export function attachGamepadRuntime(
  controller: InputRuntimeController,
  options: GamepadRuntimeAdapterOptions = {},
): () => void {
  const globals = globalThis as unknown as {
    navigator?: { getGamepads?: () => readonly (GamepadLike | null)[] };
    requestAnimationFrame?: (callback: () => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const getGamepads = options.getGamepads ?? (() => globals.navigator?.getGamepads?.() ?? []);
  const scheduler = options.scheduler ?? defaultFrameScheduler(globals);
  const eventTarget =
    options.eventTarget ?? (globals as { window?: RuntimeEventTargetLike }).window;
  const resetOnDetach = options.resetOnDetach ?? true;
  const triggers = gamepadTriggers(controller.effectiveBindings);
  const active = new Map<string, GamepadButtonStroke | GamepadAxisStroke>();
  const analogSources = new Map<string, string>();
  let stopped = false;
  // Defined only while a poll is scheduled; polling idles when no pad is connected.
  let frame: unknown;

  const connectedPads = (excludeIndex?: number) =>
    getGamepads().filter(
      (gamepad): gamepad is GamepadLike =>
        gamepad !== null && gamepad.connected !== false && gamepad.index !== excludeIndex,
    );

  const sample = (gamepads: readonly GamepadLike[]) => {
    for (const trigger of triggers) {
      const identity = inputStrokeIdentity(trigger);
      const isActive = active.has(identity);
      const nextActive = gamepadStrokeActive(trigger, gamepads, isActive);
      if (!isActive && nextActive) {
        active.set(identity, structuredClone(trigger));
        controller.handleInputDown(trigger);
      } else if (isActive && !nextActive) {
        const stored = active.get(identity);
        active.delete(identity);
        if (stored) {
          controller.handleInputUp(stored);
        }
      }
    }
    sampleAnalog(gamepads);
    if (options.deviceTracker && gamepads.some(gamepadHasActivity)) {
      options.deviceTracker.markActive("gamepad");
    }
  };

  const sampleAnalog = (gamepads: readonly GamepadLike[]) => {
    if (!options.analog) {
      return;
    }
    const analog = options.analog.controller;
    const seen = new Set<string>();
    options.analog.bindings.forEach((binding, bindingIndex) => {
      for (const gamepad of gamepads) {
        if (binding.gamepad !== undefined && gamepad.index !== binding.gamepad) {
          continue;
        }
        const sourceId = `gamepad:${gamepad.index}:${bindingIndex}`;
        seen.add(sourceId);
        analogSources.set(sourceId, binding.action);
        const deadzone = binding.deadzone ?? DEFAULT_GAMEPAD_DEADZONE;
        if ("axis" in binding) {
          analog.setAxis1D(
            sourceId,
            binding.action,
            applyAxis1DDeadzone(finiteAxis(gamepad.axes[binding.axis]), deadzone),
          );
        } else {
          const y = finiteAxis(gamepad.axes[binding.yAxis]);
          analog.setAxis2D(
            sourceId,
            binding.action,
            applyAxis2DDeadzone(
              { x: finiteAxis(gamepad.axes[binding.xAxis]), y: binding.invertY ? -y : y },
              deadzone,
            ),
          );
        }
      }
    });
    for (const [sourceId, action] of [...analogSources]) {
      if (!seen.has(sourceId)) {
        analogSources.delete(sourceId);
        analog.clearSource(sourceId, action);
      }
    }
  };

  const poll = () => {
    frame = undefined;
    if (stopped) {
      return;
    }
    const gamepads = connectedPads();
    sample(gamepads);
    if (gamepads.length > 0) {
      schedule();
    }
  };

  const schedule = () => {
    if (!stopped && frame === undefined) {
      frame = scheduler.requestFrame(poll);
    }
  };

  const onConnected = () => schedule();
  const onDisconnected = (event: { gamepad?: { index: number } }) => {
    // Release what the departed pad held now rather than on the next frame;
    // the browser may still list it until then.
    sample(connectedPads(event.gamepad?.index));
  };

  eventTarget?.addEventListener("gamepadconnected", onConnected);
  eventTarget?.addEventListener("gamepaddisconnected", onDisconnected);
  schedule();

  return () => {
    stopped = true;
    eventTarget?.removeEventListener("gamepadconnected", onConnected);
    eventTarget?.removeEventListener("gamepaddisconnected", onDisconnected);
    if (frame !== undefined) {
      scheduler.cancelFrame(frame);
      frame = undefined;
    }
    for (const stroke of active.values()) {
      controller.handleInputUp(stroke);
    }
    active.clear();
    for (const [sourceId, action] of analogSources) {
      options.analog?.controller.clearSource(sourceId, action);
    }
    analogSources.clear();
    if (resetOnDetach) {
      controller.reset("gamepadDetached");
    }
  };
}

function finiteAxis(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : 0;
}

function gamepadHasActivity(gamepad: GamepadLike): boolean {
  return (
    gamepad.buttons.some(
      (button) => button.pressed === true || button.value >= GAMEPAD_ACTIVITY_THRESHOLD,
    ) || gamepad.axes.some((value) => Math.abs(value) >= GAMEPAD_ACTIVITY_THRESHOLD)
  );
}

export function gamepadStrokeActive(
  stroke: GamepadButtonStroke | GamepadAxisStroke,
  gamepads: readonly (GamepadLike | null)[],
  wasActive = false,
): boolean {
  const candidates = gamepads.filter(
    (gamepad): gamepad is GamepadLike =>
      gamepad !== null &&
      gamepad.connected !== false &&
      (stroke.gamepad === undefined || gamepad.index === stroke.gamepad),
  );
  if (stroke.device === "gamepadButton") {
    return candidates.some((gamepad) => {
      const button = gamepad.buttons[stroke.button];
      return (
        button !== undefined && (button.pressed === true || button.value * 100 >= stroke.threshold)
      );
    });
  }

  return candidates.some((gamepad) => {
    const value = gamepad.axes[stroke.axis];
    if (value === undefined || !Number.isFinite(value)) {
      return false;
    }
    const signMatches = stroke.direction === "positive" ? value > 0 : value < 0;
    if (!signMatches) {
      return false;
    }
    const magnitude = Math.abs(value) * 100;
    return wasActive ? magnitude > stroke.deadzone : magnitude >= stroke.threshold;
  });
}

function gamepadTriggers(
  bindings: readonly { sequence: readonly InputStroke[] }[],
): Array<GamepadButtonStroke | GamepadAxisStroke> {
  const result = new Map<string, GamepadButtonStroke | GamepadAxisStroke>();
  for (const binding of bindings) {
    for (const stroke of binding.sequence) {
      if (
        "device" in stroke &&
        (stroke.device === "gamepadButton" || stroke.device === "gamepadAxis")
      ) {
        result.set(inputStrokeIdentity(stroke), structuredClone(stroke));
      }
    }
  }
  return [...result.values()].sort((left, right) =>
    inputStrokeIdentity(left).localeCompare(inputStrokeIdentity(right)),
  );
}

function defaultFrameScheduler(globals: {
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
}): FrameScheduler {
  if (globals.requestAnimationFrame && globals.cancelAnimationFrame) {
    return {
      requestFrame: (callback) => globals.requestAnimationFrame!(callback),
      cancelFrame: (handle) => globals.cancelAnimationFrame!(handle as number),
    };
  }
  return {
    requestFrame: (callback) => globalThis.setTimeout(callback, 16),
    cancelFrame: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  };
}

function modifiersFromEvent(event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  getModifierState?: (key: string) => boolean;
}): Modifiers {
  const altGraph = event.getModifierState?.("AltGraph") ?? false;
  return {
    ctrl: altGraph ? false : event.ctrlKey,
    alt: altGraph ? false : event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    altGraph,
  };
}
