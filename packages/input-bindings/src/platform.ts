import {
  inputStrokeEquals,
  isKeyStroke,
  type Binding,
  type InputStroke,
  type WhenExpr,
} from "./index.ts";

export type PlatformFamily = "windows" | "macos" | "linux" | "android" | "ios" | "unknown";
export type BrowserFamily = "chromium" | "firefox" | "safari" | "unknown";
export type PlatformConflictSeverity = "info" | "warning";
export type PlatformConflictKind =
  | "browserShortcut"
  | "osShortcut"
  | "accessibilityShortcut"
  | "layoutSensitive"
  | "altGraphSensitive"
  | "imeSensitive";

export interface PlatformConflictSource {
  id: string;
  title: string;
  url: string;
  verifiedOn?: string;
}

export interface PlatformConflictRule {
  id: string;
  title: string;
  kind: Exclude<
    PlatformConflictKind,
    "layoutSensitive" | "altGraphSensitive" | "imeSensitive"
  >;
  severity: PlatformConflictSeverity;
  sequence: InputStroke[];
  platforms?: PlatformFamily[];
  browsers?: BrowserFamily[];
  source: PlatformConflictSource;
  note?: string;
}

export interface PlatformConflictEnvironment {
  platform: PlatformFamily;
  browser: BrowserFamily;
  layoutMapAvailable?: boolean;
}

export interface PlatformConflictDiagnostic {
  bindingId: string;
  action: string;
  kind: PlatformConflictKind;
  severity: PlatformConflictSeverity;
  title: string;
  source: PlatformConflictSource;
  ruleId?: string;
  note?: string;
}

const ALT_GRAPH_SOURCE: PlatformConflictSource = {
  id: "mdn.keyboard-event.get-modifier-state",
  title: "MDN KeyboardEvent.getModifierState()",
  url: "https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState",
  verifiedOn: "2026-09-16",
};

const LAYOUT_SOURCE: PlatformConflictSource = {
  id: "mdn.keyboard.get-layout-map",
  title: "MDN Keyboard.getLayoutMap()",
  url: "https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap",
  verifiedOn: "2026-09-16",
};

const IME_SOURCE: PlatformConflictSource = {
  id: "mdn.keydown-ime",
  title: "MDN keydown events with IME",
  url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event",
  verifiedOn: "2026-09-16",
};

export function analyzePlatformConflicts(
  bindings: readonly Binding[],
  catalog: readonly PlatformConflictRule[],
  environment: PlatformConflictEnvironment,
): PlatformConflictDiagnostic[] {
  const diagnostics: PlatformConflictDiagnostic[] = [];

  for (const binding of bindings) {
    for (const rule of catalog) {
      if (!ruleApplies(rule, environment)) continue;
      if (!sequenceEquals(binding.sequence, rule.sequence)) continue;
      diagnostics.push({
        bindingId: binding.id,
        action: binding.action,
        kind: rule.kind,
        severity: rule.severity,
        title: rule.title,
        source: structuredClone(rule.source),
        ruleId: rule.id,
        note: rule.note,
      });
    }

    if (isAltGraphSensitive(binding, environment)) {
      diagnostics.push({
        bindingId: binding.id,
        action: binding.action,
        kind: "altGraphSensitive",
        severity: "warning",
        title: "Ctrl+Alt may overlap AltGr input",
        source: ALT_GRAPH_SOURCE,
        note: "AltGr can surface as Control/Alt state on some browser and operating-system combinations. Prefer an AltGraph-aware or different shortcut when text entry matters.",
      });
    }

    if (isImeSensitive(binding)) {
      diagnostics.push({
        bindingId: binding.id,
        action: binding.action,
        kind: "imeSensitive",
        severity: "info",
        title: "Unmodified printable key is sensitive to text composition",
        source: IME_SOURCE,
        note: "This binding is globally active and uses an unmodified printable logical key. Keep text-entry/IME contexts excluded and continue ignoring composing keyboard events.",
      });
    }

    if (isLayoutSensitive(binding, environment)) {
      diagnostics.push({
        bindingId: binding.id,
        action: binding.action,
        kind: "layoutSensitive",
        severity: "info",
        title: "Physical binding cannot be labeled from the active keyboard layout",
        source: LAYOUT_SOURCE,
        note: "The binding remains positionally correct, but Keyboard.getLayoutMap() is unavailable, so displayed key labels may not match the user's layout.",
      });
    }
  }

  return diagnostics.sort(compareDiagnostic);
}

function ruleApplies(
  rule: PlatformConflictRule,
  environment: PlatformConflictEnvironment,
): boolean {
  if (rule.platforms?.length && !rule.platforms.includes(environment.platform)) return false;
  if (rule.browsers?.length && !rule.browsers.includes(environment.browser)) return false;
  return true;
}

function sequenceEquals(left: readonly InputStroke[], right: readonly InputStroke[]): boolean {
  return (
    left.length === right.length &&
    left.every((stroke, index) => inputStrokeEquals(stroke, right[index]))
  );
}

function isAltGraphSensitive(
  binding: Binding,
  environment: PlatformConflictEnvironment,
): boolean {
  if (environment.platform !== "windows" && environment.platform !== "linux") return false;
  return binding.sequence.some(
    (stroke) =>
      isKeyStroke(stroke) &&
      Boolean(stroke.modifiers?.ctrl) &&
      Boolean(stroke.modifiers?.alt) &&
      !Boolean(stroke.modifiers?.altGraph),
  );
}

function isImeSensitive(binding: Binding): boolean {
  if (!isAlways(binding.when)) return false;
  return binding.sequence.some((stroke) => {
    if (!isKeyStroke(stroke) || stroke.key.kind !== "logical") return false;
    const modifiers = stroke.modifiers ?? {};
    if (modifiers.ctrl || modifiers.alt || modifiers.meta || modifiers.altGraph) return false;
    return isPrintableLogicalKey(stroke.key.value);
  });
}

function isLayoutSensitive(
  binding: Binding,
  environment: PlatformConflictEnvironment,
): boolean {
  if (environment.layoutMapAvailable !== false) return false;
  return binding.sequence.some(
    (stroke) => isKeyStroke(stroke) && stroke.key.kind === "physical",
  );
}

function isAlways(expression: WhenExpr | undefined): boolean {
  return !expression || expression.op === "always";
}

function isPrintableLogicalKey(value: string): boolean {
  return value === "Space" || value === " " || Array.from(value).length === 1;
}

function compareDiagnostic(
  left: PlatformConflictDiagnostic,
  right: PlatformConflictDiagnostic,
): number {
  return (
    compareText(left.bindingId, right.bindingId) ||
    compareText(left.kind, right.kind) ||
    compareText(left.ruleId ?? "", right.ruleId ?? "") ||
    compareText(left.title, right.title)
  );
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
