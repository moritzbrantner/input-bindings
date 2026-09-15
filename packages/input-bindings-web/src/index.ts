import type { KeyStroke, Modifiers } from "@moritzbrantner/input-bindings";

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
