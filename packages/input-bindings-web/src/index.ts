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
import type { InputRuntimeController, RuntimeDecision } from "@moritzbrantner/input-bindings-runtime";

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

export interface GamepadRuntimeHandle {
  stop(): void;
  poll(): void;
}

export interface RuntimeInputTarget {
  handleInputDown(stroke: InputStroke, repeat?: boolean): RuntimeDecision;
  handleInputUp(stroke: InputStroke): RuntimeDecision;
  reset(reason?: string): RuntimeDecision;
}

const MODIFIER_KEYS = new Set([
  "Alt",
  "AltGraph",
  "Control",
  "Meta",
  "Shift",
  "CapsLock",
  "NumLock",
  "ScrollLock",
]);

export function keyboardEventToStroke(
  event: KeyboardEventLike,
  options: KeyboardAdapterOptions = {},
): KeyStroke | undefined {
  const {
    mode = "logical",
    altGraph = "distinct",
    ignoreComposing = true,
    ignoreModifierOnly = true,
    respectDefaultPrevented = true,
  } = options;

  if (respectDefaultPrevented && event.defaultPrevented) return undefined;
  if (ignoreComposing && event.isComposing) return undefined;
  if (ignoreModifierOnly && MODIFIER_KEYS.has(event.key)) return undefined;

  const modifiers = modifiersFromEvent(event, altGraph);
  return {
    key:
      mode === "physical"
        ? { kind: "physical", value: event.code }
        : { kind: "logical", value: normalizeLogicalKey(event.key) },
    modifiers,
  };
}

export function mouseEventToStroke(event: PointerEventLike): MouseButtonStroke | undefined {
  if (event.defaultPrevented) return undefined;
  if (!Number.isInteger(event.button) || event.button < 0) return undefined;
  return {
    device: "mouseButton",
    button: event.button,
    modifiers: modifiersFromEvent(event, "distinct"),
  };
}

export function wheelEventToStroke(event: WheelEventLike): WheelStroke | undefined {
  if (event.defaultPrevented) return undefined;
  const direction = dominantWheelDirection(event.deltaX, event.deltaY);
  if (!direction) return undefined;
  return {
    device: "wheel",
    direction,
    modifiers: modifiersFromEvent(event, "distinct"),
  };
}

export function attachKeyboardRuntime(
  controller: RuntimeInputTarget,
  options: BrowserRuntimeAdapterOptions = {},
): () => void {
  const keyTarget = options.keyTarget ?? globalThis.document;
  const focusTarget = options.focusTarget ?? globalThis.window;
  const visibilityTarget = options.visibilityTarget ?? globalThis.document;
  const pressed = new Map<string, KeyStroke>();
  const mode = options.mode ?? "logical";
  const resetOnBlur = options.resetOnBlur ?? true;
  const resetOnHidden = options.resetOnHidden ?? true;
  const resetOnDetach = options.resetOnDetach ?? true;

  if (!keyTarget || !focusTarget || !visibilityTarget) return () => undefined;

  const onKeyDown = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    if (options.ignoreTextEntry !== false && eventTargetsTextEntry(event.target)) return;
    const stroke = keyboardEventToStroke(event, {
      ...options.keyboardOptions,
      mode: typeof mode === "function" ? mode() : mode,
    });
    if (!stroke) return;
    const decision = controller.handleInputDown(stroke, event.repeat === true);
    pressed.set(inputStrokeIdentity(stroke), stroke);
    consumeRuntimeEvent(event, decision, options.stopPropagation);
  };

  const onKeyUp = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    const stroke = keyboardEventToStroke(event, {
      ...options.keyboardOptions,
      mode: typeof mode === "function" ? mode() : mode,
    });
    if (!stroke) return;
    const identity = inputStrokeIdentity(stroke);
    const releaseStroke = pressed.get(identity) ?? stroke;
    pressed.delete(identity);
    const decision = controller.handleInputUp(releaseStroke);
    consumeRuntimeEvent(event, decision, options.stopPropagation);
  };

  const reset = (reason: string) => {
    pressed.clear();
    controller.reset(reason);
  };
  const onBlur = () => {
    if (resetOnBlur) reset("windowBlurred");
  };
  const onVisibilityChange = () => {
    if (
      resetOnHidden &&
      (visibilityTarget.hidden === true || visibilityTarget.visibilityState === "hidden")
    ) {
      reset("documentHidden");
    }
  };

  keyTarget.addEventListener("keydown", onKeyDown);
  keyTarget.addEventListener("keyup", onKeyUp);
  focusTarget.addEventListener("blur", onBlur);
  visibilityTarget.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    keyTarget.removeEventListener("keydown", onKeyDown);
    keyTarget.removeEventListener("keyup", onKeyUp);
    focusTarget.removeEventListener("blur", onBlur);
    visibilityTarget.removeEventListener("visibilitychange", onVisibilityChange);
    pressed.clear();
    if (resetOnDetach) controller.reset("keyboardDetached");
  };
}

export function attachMouseRuntime(
  controller: RuntimeInputTarget,
  options: MouseRuntimeAdapterOptions = {},
): () => void {
  const target = options.target ?? globalThis.document;
  const active = new Map<string, MouseButtonStroke>();
  const resetOnDetach = options.resetOnDetach ?? true;
  if (!target) return () => undefined;

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as PointerEventLike;
    if (options.ignoreTextEntry !== false && eventTargetsTextEntry(event.target)) return;
    if (options.respectDefaultPrevented !== false && event.defaultPrevented) return;
    const stroke = mouseEventToStroke(event);
    if (!stroke) return;
    active.set(inputStrokeIdentity(stroke), stroke);
    const decision = controller.handleInputDown(stroke);
    consumeRuntimeEvent(event, decision, options.stopPropagation);
  };
  const onPointerUp = (rawEvent: any) => {
    const event = rawEvent as PointerEventLike;
    const stroke = mouseEventToStroke(event);
    if (!stroke) return;
    const identity = inputStrokeIdentity(stroke);
    const releaseStroke = active.get(identity) ?? stroke;
    active.delete(identity);
    const decision = controller.handleInputUp(releaseStroke);
    consumeRuntimeEvent(event, decision, options.stopPropagation);
  };

  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointerup", onPointerUp);

  return () => {
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointerup", onPointerUp);
    for (const stroke of active.values()) controller.handleInputUp(stroke);
    active.clear();
    if (resetOnDetach) controller.reset("mouseDetached");
  };
}

export function attachGamepadRuntime(
  controller: RuntimeInputTarget,
  options: GamepadRuntimeAdapterOptions = {},
): () => void {
  const getGamepads = options.getGamepads ?? defaultGetGamepads;
  const scheduler = options.scheduler ?? defaultFrameScheduler;
  const resetOnDetach = options.resetOnDetach ?? true;
  const active = new Map<string, GamepadButtonStroke | GamepadAxisStroke>();
  let frame: unknown;
  let stopped = false;

  const poll = () => {
    if (stopped) return;
    const gamepads = getGamepads();
    const next = discoverGamepadStrokes(gamepads);
    for (const stroke of next) {
      const identity = inputStrokeIdentity(stroke);
      const isActive = active.has(identity);
      const nextActive = gamepadStrokeActive(stroke, gamepads, isActive);
      if (!isActive && nextActive) {
        active.set(identity, stroke);
        controller.handleInputDown(stroke);
      } else if (isActive && !nextActive) {
        const stored = active.get(identity);
        active.delete(identity);
        if (stored) controller.handleInputUp(stored);
      }
    }
    frame = scheduler.requestFrame(poll);
  };

  frame = scheduler.requestFrame(poll);

  return () => {
    stopped = true;
    if (frame !== undefined) scheduler.cancelFrame(frame);
    for (const stroke of active.values()) controller.handleInputUp(stroke);
    active.clear();
    if (resetOnDetach) controller.reset("gamepadDetached");
  };
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
      return Boolean(button) && (button.pressed === true || button.value * 100 >= stroke.threshold);
    });
  }

  return candidates.some((gamepad) => {
    const value = gamepad.axes[stroke.axis];
    if (!Number.isFinite(value)) return false;
    const signMatches = stroke.direction === "positive" ? value > 0 : value < 0;
    if (!signMatches) return false;
    const magnitude = Math.abs(value) * 100;
    return wasActive ? magnitude > stroke.deadzone : magnitude >= stroke.threshold;
  });
}

export function gamepadButtonEventToStroke(
  gamepad: number,
  button: number,
  threshold = 50,
): GamepadButtonStroke {
  return { device: "gamepadButton", gamepad, button, threshold };
}

export function gamepadAxisEventToStroke(
  gamepad: number,
  axis: number,
  direction: "negative" | "positive",
  threshold = 50,
  deadzone = 30,
): GamepadAxisStroke {
  return { device: "gamepadAxis", gamepad, axis, direction, threshold, deadzone };
}

export function discoverGamepadStrokes(
  gamepads: readonly (GamepadLike | null)[],
): Array<GamepadButtonStroke | GamepadAxisStroke> {
  const strokes: Array<GamepadButtonStroke | GamepadAxisStroke> = [];
  for (const gamepad of gamepads) {
    if (!gamepad || gamepad.connected === false) continue;
    for (let button = 0; button < gamepad.buttons.length; button += 1) {
      strokes.push(gamepadButtonEventToStroke(gamepad.index, button));
    }
    for (let axis = 0; axis < gamepad.axes.length; axis += 1) {
      strokes.push(gamepadAxisEventToStroke(gamepad.index, axis, "negative"));
      strokes.push(gamepadAxisEventToStroke(gamepad.index, axis, "positive"));
    }
  }
  return strokes;
}

function consumeRuntimeEvent(
  event: { preventDefault?: () => void; stopPropagation?: () => void },
  decision: RuntimeDecision,
  stopPropagation = false,
): void {
  if (!decision.consumed) return;
  event.preventDefault?.();
  if (stopPropagation) event.stopPropagation?.();
}

function defaultGetGamepads(): readonly (GamepadLike | null)[] {
  const navigatorLike = globalThis.navigator as Navigator & {
    getGamepads?: () => readonly (GamepadLike | null)[];
  };
  return navigatorLike?.getGamepads?.() ?? [];
}

const defaultFrameScheduler: FrameScheduler = {
  requestFrame(callback) {
    return globalThis.requestAnimationFrame(callback);
  },
  cancelFrame(handle) {
    globalThis.cancelAnimationFrame(handle as number);
  },
};

function modifiersFromEvent(
  event: Pick<KeyboardEventLike, "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "getModifierState">,
  altGraphMode: "distinct" | "ctrlAlt",
): Modifiers | undefined {
  const altGraph = event.getModifierState?.("AltGraph") === true;
  const ctrl = altGraph && altGraphMode === "distinct" ? false : event.ctrlKey;
  const alt = altGraph && altGraphMode === "distinct" ? false : event.altKey;
  if (!ctrl && !alt && !event.shiftKey && !event.metaKey && !altGraph) return undefined;
  return {
    ctrl,
    alt,
    shift: event.shiftKey,
    meta: event.metaKey,
    altGraph: altGraphMode === "distinct" && altGraph,
  };
}

function normalizeLogicalKey(key: string): string {
  if (key.length === 1) return key.toLocaleLowerCase();
  return key;
}

function dominantWheelDirection(
  deltaX: number,
  deltaY: number,
): WheelStroke["direction"] | undefined {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return undefined;
  if (deltaX === 0 && deltaY === 0) return undefined;
  if (Math.abs(deltaX) > Math.abs(deltaY)) return deltaX < 0 ? "left" : "right";
  return deltaY < 0 ? "up" : "down";
}

function eventTargetsTextEntry(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as {
    tagName?: string;
    isContentEditable?: boolean;
    closest?: (selectors: string) => unknown;
  };
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(element.closest?.("[contenteditable=''], [contenteditable='true']"));
}
