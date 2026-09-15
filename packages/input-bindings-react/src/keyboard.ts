import {
  isKeyStroke,
  type Binding,
  type InputStroke,
  type KeyStroke,
} from "@moritzbrantner/input-bindings";

export interface KeyboardKeyDefinition {
  code: string;
  label: string;
  width?: number;
}

export const KEYBOARD_ROWS: readonly (readonly KeyboardKeyDefinition[])[] = [
  [
    { code: "Escape", label: "Esc", width: 1.25 },
    { code: "F1", label: "F1" },
    { code: "F2", label: "F2" },
    { code: "F3", label: "F3" },
    { code: "F4", label: "F4" },
    { code: "F5", label: "F5" },
    { code: "F6", label: "F6" },
    { code: "F7", label: "F7" },
    { code: "F8", label: "F8" },
    { code: "F9", label: "F9" },
    { code: "F10", label: "F10" },
    { code: "F11", label: "F11" },
    { code: "F12", label: "F12" },
  ],
  [
    { code: "Backquote", label: "`" },
    ...Array.from({ length: 10 }, (_, index) => ({
      code: `Digit${(index + 1) % 10}`,
      label: String((index + 1) % 10),
    })),
    { code: "Minus", label: "-" },
    { code: "Equal", label: "=" },
    { code: "Backspace", label: "Backspace", width: 2 },
  ],
  [
    { code: "Tab", label: "Tab", width: 1.5 },
    ..."QWERTYUIOP".split("").map((letter) => ({ code: `Key${letter}`, label: letter })),
    { code: "BracketLeft", label: "[" },
    { code: "BracketRight", label: "]" },
    { code: "Backslash", label: "\\", width: 1.5 },
  ],
  [
    { code: "CapsLock", label: "Caps", width: 1.8 },
    ..."ASDFGHJKL".split("").map((letter) => ({ code: `Key${letter}`, label: letter })),
    { code: "Semicolon", label: ";" },
    { code: "Quote", label: "'" },
    { code: "Enter", label: "Enter", width: 2.2 },
  ],
  [
    { code: "ShiftLeft", label: "Shift", width: 2.3 },
    ..."ZXCVBNM".split("").map((letter) => ({ code: `Key${letter}`, label: letter })),
    { code: "Comma", label: "," },
    { code: "Period", label: "." },
    { code: "Slash", label: "/" },
    { code: "ShiftRight", label: "Shift", width: 2.7 },
  ],
  [
    { code: "ControlLeft", label: "Ctrl", width: 1.4 },
    { code: "MetaLeft", label: "Meta", width: 1.4 },
    { code: "AltLeft", label: "Alt", width: 1.4 },
    { code: "Space", label: "Space", width: 6.4 },
    { code: "AltRight", label: "Alt", width: 1.4 },
    { code: "MetaRight", label: "Meta", width: 1.4 },
    { code: "ControlRight", label: "Ctrl", width: 1.4 },
  ],
] as const;

const SPECIAL_LOGICAL_CODES: Readonly<Record<string, string>> = {
  Escape: "Escape",
  Esc: "Escape",
  Tab: "Tab",
  Backspace: "Backspace",
  Enter: "Enter",
  Space: "Space",
  " ": "Space",
  ArrowUp: "ArrowUp",
  ArrowDown: "ArrowDown",
  ArrowLeft: "ArrowLeft",
  ArrowRight: "ArrowRight",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  Delete: "Delete",
};

const PUNCTUATION_CODES: Readonly<Record<string, string>> = {
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
};

const LAYOUT_LABEL_CODE = /^(?:Key[A-Z]|Digit[0-9]|Backquote|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash)$/u;

export function keyboardLabelForCode(
  code: string,
  layoutLabels?: ReadonlyMap<string, string>,
): string {
  const fallback = KEYBOARD_ROWS.flat().find((key) => key.code === code)?.label ?? code;
  if (!LAYOUT_LABEL_CODE.test(code)) return fallback;
  const layoutLabel = layoutLabels?.get(code);
  if (!layoutLabel || layoutLabel.trim().length === 0) return fallback;
  return layoutLabel.length === 1 ? layoutLabel.toLocaleUpperCase() : layoutLabel;
}

export function codeForStroke(
  stroke: KeyStroke,
  layoutLabels?: ReadonlyMap<string, string>,
): string | undefined {
  if (stroke.key.kind === "physical") return stroke.key.value;

  const value = stroke.key.value;
  const special = SPECIAL_LOGICAL_CODES[value];
  if (special) return special;
  if (/^F(?:[1-9]|1[0-2])$/u.test(value)) return value;

  if (layoutLabels) {
    const normalized = value.toLocaleLowerCase();
    for (const [code, label] of layoutLabels.entries()) {
      if (label.toLocaleLowerCase() === normalized) return code;
    }
  }

  if (/^[a-z]$/iu.test(value)) return `Key${value.toLocaleUpperCase()}`;
  if (/^[0-9]$/u.test(value)) return `Digit${value}`;
  return PUNCTUATION_CODES[value];
}

export function codesForStroke(
  stroke: KeyStroke,
  layoutLabels?: ReadonlyMap<string, string>,
): string[] {
  const codes: string[] = [];
  if (stroke.modifiers?.ctrl) codes.push("ControlLeft", "ControlRight");
  if (stroke.modifiers?.shift) codes.push("ShiftLeft", "ShiftRight");
  if (stroke.modifiers?.alt) codes.push("AltLeft", "AltRight");
  if (stroke.modifiers?.meta) codes.push("MetaLeft", "MetaRight");
  if (stroke.modifiers?.altGraph) codes.push("AltRight");
  const primary = codeForStroke(stroke, layoutLabels);
  if (primary) codes.push(primary);
  return [...new Set(codes)];
}

export function codesForSequence(
  sequence: readonly InputStroke[],
  layoutLabels?: ReadonlyMap<string, string>,
): string[] {
  return [
    ...new Set(
      sequence
        .filter(isKeyStroke)
        .flatMap((stroke) => codesForStroke(stroke, layoutLabels)),
    ),
  ];
}

export function bindingUsesCode(
  binding: Binding,
  code: string,
  layoutLabels?: ReadonlyMap<string, string>,
): boolean {
  return binding.sequence.some(
    (stroke) => isKeyStroke(stroke) && codesForStroke(stroke, layoutLabels).includes(code),
  );
}

export function bindingIdsForCode(
  bindings: readonly Binding[],
  code: string,
  layoutLabels?: ReadonlyMap<string, string>,
): string[] {
  return bindings
    .filter((binding) => bindingUsesCode(binding, code, layoutLabels))
    .map((binding) => binding.id)
    .sort();
}
