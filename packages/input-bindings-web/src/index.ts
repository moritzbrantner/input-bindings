import type { KeyStroke, Modifiers } from "@moritzbrantner/input-bindings";
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

export interface RuntimeEventTargetLike {
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
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

const MODIFIER_ONLY_KEYS = new Set(["Alt", "AltGraph", "Control", "Meta", "Shift"]);

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
  if (ignoreModifierOnly && MODIFIER_ONLY_KEYS.has(event.key)) {
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

export function normalizeLogicalKey(key: string): string {
  if (key === " ") {
    return "Space";
  }
  if (key === "Esc") {
    return "Escape";
  }
  if (key.length === 1) {
    return key.toLocaleLowerCase();
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

  const applyConsumption = (event: RuntimeKeyboardEventLike, decision: RuntimeDecision) => {
    if (!decision.consumed) return;
    event.preventDefault?.();
    if (options.stopPropagation) {
      event.stopPropagation?.();
    }
  };

  const normalize = (event: RuntimeKeyboardEventLike) =>
    keyboardEventToStroke(event, {
      ...options.keyboardOptions,
      mode: typeof options.mode === "function" ? options.mode() : (options.mode ?? "logical"),
    });

  const onKeyDown = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    if (ignoreTextEntry && isTextEntryTarget(event.target)) return;
    const stroke = normalize(event);
    if (!stroke) return;
    const decision = controller.handleKeyDown(stroke, { repeat: Boolean(event.repeat) });
    applyConsumption(event, decision);
  };

  const onKeyUp = (rawEvent: any) => {
    const event = rawEvent as RuntimeKeyboardEventLike;
    if (ignoreTextEntry && isTextEntryTarget(event.target)) return;
    const stroke = normalize(event);
    if (!stroke) return;
    const decision = controller.handleKeyUp(stroke);
    applyConsumption(event, decision);
  };

  const onBlur = () => {
    if (resetOnBlur) controller.reset("blur");
  };

  const onVisibilityChange = () => {
    if (
      resetOnHidden &&
      (visibilityTarget?.hidden === true || visibilityTarget?.visibilityState === "hidden")
    ) {
      controller.reset("hidden");
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
    if (resetOnDetach) controller.reset("detached");
  };
}
