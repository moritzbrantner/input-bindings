import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { memo, useMemo } from "react";
import { KEYBOARD_ROWS, codesForSequence, createKeyboardBindingIndex, keyboardLabelForCode, } from "./keyboard.js";
import { contextsForWhen } from "./model.js";
// Shared so omitted props keep their identity across renders and the memoized derivations below
// are not rebuilt on every key event.
const NO_CONFLICTS = [];
const NO_IDS = [];
const NO_PRESSED_CODES = new Set();
const NO_STROKES = [];
export function KeyboardView({ bindings, conflicts = NO_CONFLICTS, selectedActionId, selectedBindingId, scope = "visible", context, visibleActionIds = NO_IDS, pressedCodes = NO_PRESSED_CODES, highlightedSequence = NO_STROKES, layoutLabels, onKeyInspect, }) {
    const conflictIds = useMemo(() => new Set(conflicts.flatMap((conflict) => [conflict.leftBindingId, conflict.rightBindingId])), [conflicts]);
    const visibleActions = useMemo(() => new Set(visibleActionIds), [visibleActionIds]);
    const highlightedCodes = useMemo(() => new Set(codesForSequence(highlightedSequence, layoutLabels)), [highlightedSequence, layoutLabels]);
    const scopedBindings = useMemo(() => {
        switch (scope) {
            case "selectedAction":
                return selectedActionId
                    ? bindings.filter((binding) => binding.action === selectedActionId)
                    : [];
            case "context":
                return context
                    ? bindings.filter((binding) => contextsForWhen(binding.when).includes(context))
                    : bindings;
            case "conflicts":
                return bindings.filter((binding) => conflictIds.has(binding.id));
            case "visible":
                return visibleActions.size > 0
                    ? bindings.filter((binding) => visibleActions.has(binding.action))
                    : bindings;
        }
    }, [bindings, conflictIds, context, scope, selectedActionId, visibleActions]);
    const allBindingIdsByCode = useMemo(() => createKeyboardBindingIndex(bindings, layoutLabels), [bindings, layoutLabels]);
    const scopedBindingIdsByCode = useMemo(() => scopedBindings === bindings
        ? allBindingIdsByCode
        : createKeyboardBindingIndex(scopedBindings, layoutLabels), [allBindingIdsByCode, bindings, layoutLabels, scopedBindings]);
    const selectedCodes = useMemo(() => {
        if (!selectedBindingId) {
            return new Set();
        }
        const selectedBinding = bindings.find((binding) => binding.id === selectedBindingId);
        return new Set(selectedBinding ? codesForSequence(selectedBinding.sequence, layoutLabels) : []);
    }, [bindings, layoutLabels, selectedBindingId]);
    return (_jsx("div", { className: "ib-keyboard", role: "group", "aria-label": "Keyboard binding overview", children: KEYBOARD_ROWS.map((row, rowIndex) => (_jsx("div", { className: "ib-keyboard-row", children: row.map((key) => (_jsx(KeyboardKey, { definition: key, scopedBindingIds: scopedBindingIdsByCode.get(key.code) ?? NO_IDS, allBindingIds: allBindingIdsByCode.get(key.code) ?? NO_IDS, conflictIds: conflictIds, selected: selectedCodes.has(key.code), pressed: pressedCodes.has(key.code), highlighted: highlightedCodes.has(key.code), layoutLabels: layoutLabels, onInspect: onKeyInspect }, key.code))) }, rowIndex))) }));
}
// Memoized because a key event changes the props of only the few keys it affects.
const KeyboardKey = memo(function KeyboardKey({ definition, scopedBindingIds, allBindingIds, conflictIds, selected, pressed, highlighted, layoutLabels, onInspect, }) {
    const conflicting = allBindingIds.some((id) => conflictIds.has(id));
    const classes = [
        "ib-key",
        scopedBindingIds.length > 0 ? "is-used" : "",
        conflicting ? "is-conflict" : "",
        selected ? "is-selected" : "",
        pressed ? "is-pressed" : "",
        highlighted ? "is-highlighted" : "",
    ]
        .filter(Boolean)
        .join(" ");
    const label = keyboardLabelForCode(definition.code, layoutLabels);
    const detail = allBindingIds.length === 0
        ? "unused"
        : `${allBindingIds.length} binding${allBindingIds.length === 1 ? "" : "s"}`;
    const content = (_jsxs(_Fragment, { children: [_jsx("span", { className: "ib-key-label", children: label }), allBindingIds.length > 0 && (_jsxs(_Fragment, { children: [" ", _jsx("span", { className: "ib-key-count", children: allBindingIds.length })] }))] }));
    if (onInspect) {
        return (_jsx("button", { type: "button", className: classes, "data-key-code": definition.code, style: { flex: definition.width ?? 1 }, title: `${definition.code}: ${detail}`, "aria-label": `${label} ${detail}${conflicting ? " conflict" : ""}`, onClick: () => onInspect(definition.code, [...allBindingIds]), children: content }));
    }
    return (_jsx("div", { className: classes, "data-key-code": definition.code, style: { flex: definition.width ?? 1 }, title: `${definition.code}: ${detail}`, "aria-hidden": "true", children: content }));
});
export function KeyboardLegend() {
    return (_jsxs("div", { className: "ib-keyboard-legend", "aria-label": "Keyboard overview legend", children: [_jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-used" }), " Used"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-selected" }), " Selected"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-conflict" }), " Conflict"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-pressed" }), " Pressed now"] })] }));
}
