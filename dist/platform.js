import { inputStrokeEquals, isKeyStroke, } from "./index.js";
const ALT_GRAPH_SOURCE = {
    id: "mdn.keyboard-event.get-modifier-state",
    title: "MDN KeyboardEvent.getModifierState()",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/getModifierState",
    verifiedOn: "2026-09-16",
};
const LAYOUT_SOURCE = {
    id: "mdn.keyboard.get-layout-map",
    title: "MDN Keyboard.getLayoutMap()",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/Keyboard/getLayoutMap",
    verifiedOn: "2026-09-16",
};
const IME_SOURCE = {
    id: "mdn.keydown-ime",
    title: "MDN keydown events with IME",
    url: "https://developer.mozilla.org/en-US/docs/Web/API/Element/keydown_event",
    verifiedOn: "2026-09-16",
};
export function analyzePlatformConflicts(bindings, catalog, environment) {
    const diagnostics = [];
    for (const binding of bindings) {
        for (const rule of catalog) {
            if (!ruleApplies(rule, environment)) {
                continue;
            }
            if (!sequenceEquals(binding.sequence, rule.sequence)) {
                continue;
            }
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
function ruleApplies(rule, environment) {
    if (rule.platforms?.length && !rule.platforms.includes(environment.platform)) {
        return false;
    }
    if (rule.browsers?.length && !rule.browsers.includes(environment.browser)) {
        return false;
    }
    return true;
}
function sequenceEquals(left, right) {
    return (left.length === right.length &&
        left.every((stroke, index) => right[index] !== undefined && inputStrokeEquals(stroke, right[index])));
}
function isAltGraphSensitive(binding, environment) {
    if (environment.platform !== "windows" && environment.platform !== "linux") {
        return false;
    }
    return binding.sequence.some((stroke) => isKeyStroke(stroke) &&
        Boolean(stroke.modifiers?.ctrl) &&
        Boolean(stroke.modifiers?.alt) &&
        !stroke.modifiers?.altGraph);
}
function isImeSensitive(binding) {
    if (!isAlways(binding.when)) {
        return false;
    }
    return binding.sequence.some((stroke) => {
        if (!isKeyStroke(stroke) || stroke.key.kind !== "logical") {
            return false;
        }
        const modifiers = stroke.modifiers ?? {};
        if (modifiers.ctrl || modifiers.alt || modifiers.meta || modifiers.altGraph) {
            return false;
        }
        return isPrintableLogicalKey(stroke.key.value);
    });
}
function isLayoutSensitive(binding, environment) {
    if (environment.layoutMapAvailable !== false) {
        return false;
    }
    return binding.sequence.some((stroke) => isKeyStroke(stroke) && stroke.key.kind === "physical");
}
function isAlways(expression) {
    return !expression || expression.op === "always";
}
function isPrintableLogicalKey(value) {
    return value === "Space" || value === " " || Array.from(value).length === 1;
}
function compareDiagnostic(left, right) {
    return (compareText(left.bindingId, right.bindingId) ||
        compareText(left.kind, right.kind) ||
        compareText(left.ruleId ?? "", right.ruleId ?? "") ||
        compareText(left.title, right.title));
}
function compareText(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
