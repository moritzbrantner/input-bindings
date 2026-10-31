import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { analyzeConflicts, } from "@moritzbrantner/input-bindings";
import { isModifierOnlyKeyboardValue, keyboardEventToStroke, normalizeLogicalKey, } from "@moritzbrantner/input-bindings-web";
import { useId, useMemo, useRef, useState } from "react";
import { conflictLabel } from "./conflict-label.js";
import { keyboardLabelForCode } from "./keyboard.js";
import { KeyboardLegend, KeyboardView } from "./KeyboardView.js";
import { describeWhen, formatSequence, formatStroke } from "./model.js";
function normalizeManualKeyValue(value, mode) {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    let normalized = trimmed;
    if (mode === "logical") {
        normalized = normalizeLogicalKey(trimmed);
    }
    else if (/^[a-z]$/i.test(trimmed)) {
        normalized = `Key${trimmed.toUpperCase()}`;
    }
    else if (/^[0-9]$/.test(trimmed)) {
        normalized = `Digit${trimmed}`;
    }
    return isModifierOnlyKeyboardValue(normalized, mode) ? undefined : normalized;
}
export function BindingRecorder({ title, initialSequence, allBindings, allConflicts, actionId, existingBinding, layoutLabels, onSave, onCancel, }) {
    const [sequence, setSequence] = useState(() => initialSequence.map((stroke) => structuredClone(stroke)));
    const [mode, setMode] = useState(initialSequence[0]?.key.kind ?? "logical");
    const [focused, setFocused] = useState(false);
    const [pressedCodes, setPressedCodes] = useState(() => new Set());
    const [lastAccepted, setLastAccepted] = useState(null);
    const [feedback, setFeedback] = useState("Focus the recorder, then press a non-modifier key.");
    const [manualKey, setManualKey] = useState("");
    const [manualModifiers, setManualModifiers] = useState({});
    const captureRef = useRef(null);
    const manualKeyListId = useId();
    const previewBinding = useMemo(() => {
        if (!actionId || sequence.length === 0) {
            return undefined;
        }
        return existingBinding
            ? { ...existingBinding, sequence: structuredClone(sequence) }
            : {
                id: "__input-bindings-preview__",
                action: actionId,
                sequence: structuredClone(sequence),
                when: { op: "always" },
                priority: 0,
            };
    }, [actionId, existingBinding, sequence]);
    const previewConflicts = useMemo(() => {
        if (!previewBinding) {
            return [];
        }
        const previewId = previewBinding.id;
        const candidates = [
            ...allBindings.filter((binding) => binding.id !== existingBinding?.id),
            previewBinding,
        ];
        return analyzeConflicts(candidates).filter((conflict) => conflict.leftBindingId === previewId || conflict.rightBindingId === previewId);
    }, [allBindings, existingBinding?.id, previewBinding]);
    let status = "Listening";
    if (!focused) {
        status = "Idle";
    }
    else if (previewConflicts.length > 0) {
        status = "Conflict detected";
    }
    else if (sequence.length > 0) {
        status = "Captured · ready for next chord step";
    }
    const normalizedManualKey = normalizeManualKeyValue(manualKey, mode);
    const manualStroke = normalizedManualKey
        ? {
            key: { kind: mode, value: normalizedManualKey },
            modifiers: { ...manualModifiers },
        }
        : undefined;
    const applyManualStroke = (replace) => {
        if (!manualStroke) {
            return;
        }
        const nextSequence = replace ? [manualStroke] : [...sequence, manualStroke].slice(0, 4);
        setSequence(nextSequence);
        setLastAccepted(formatStroke(manualStroke));
        setFeedback(replace
            ? `Set shortcut to ${formatStroke(manualStroke)}.`
            : `Added ${formatStroke(manualStroke)} as chord step ${nextSequence.length}.`);
        setManualKey("");
    };
    const onKeyDown = (event) => {
        if (event.code) {
            setPressedCodes((current) => current.has(event.code) ? current : new Set([...current, event.code]));
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) {
            setFeedback("Held-key repeat ignored. Release the key before recording it again.");
            return;
        }
        if (event.nativeEvent.isComposing) {
            setFeedback("Input composition is active, so this key was not registered.");
            return;
        }
        const stroke = keyboardEventToStroke(event.nativeEvent, {
            mode,
            respectDefaultPrevented: false,
            ignoreComposing: true,
            ignoreModifierOnly: true,
        });
        if (!stroke) {
            setFeedback("Modifier held. Press a non-modifier key to register a stroke.");
            return;
        }
        const nextSequence = [...sequence, stroke].slice(0, 4);
        setSequence(nextSequence);
        setLastAccepted(formatStroke(stroke));
        setFeedback(nextSequence.length >= 4
            ? `Registered ${formatStroke(stroke)}. The four-step limit is reached.`
            : `Registered ${formatStroke(stroke)}. Press another non-modifier key to extend the chord, or save.`);
    };
    const onKeyUp = (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPressedCodes((current) => {
            const next = new Set(current);
            next.delete(event.code);
            return next;
        });
    };
    return (_jsxs("section", { className: "ib-recorder", "aria-labelledby": "ib-recorder-title", children: [_jsxs("div", { className: "ib-recorder-heading", children: [_jsxs("div", { children: [_jsx("h2", { id: "ib-recorder-title", children: title }), _jsx("span", { className: ["ib-recorder-status", previewConflicts.length ? "is-conflict" : ""]
                                    .filter(Boolean)
                                    .join(" "), children: status })] }), _jsxs("label", { children: ["Key interpretation", _jsxs("select", { value: mode, onChange: (event) => setMode(event.target.value), children: [_jsx("option", { value: "logical", children: "Logical key" }), _jsx("option", { value: "physical", children: "Physical position" })] })] })] }), _jsxs("div", { className: "ib-recorder-grid", children: [_jsxs("div", { children: [_jsxs("div", { ref: captureRef, className: ["ib-capture", focused ? "is-listening" : ""].filter(Boolean).join(" "), tabIndex: 0, role: "application", "aria-label": "Shortcut recorder. Focus here and press up to four keys in sequence.", onFocus: () => {
                                    setFocused(true);
                                    setFeedback(sequence.length
                                        ? "Listening for the next chord step."
                                        : "Listening. Press a non-modifier key.");
                                }, onBlur: () => {
                                    setFocused(false);
                                    setPressedCodes(new Set());
                                }, onKeyDown: onKeyDown, onKeyUp: onKeyUp, children: [_jsx("span", { className: "ib-capture-status", children: focused ? "Listening for keyboard input" : "Click or focus to start listening" }), _jsx("strong", { children: sequence.length > 0 ? formatSequence(sequence) : "No shortcut registered yet" })] }), _jsxs("section", { className: "ib-manual-binding", "aria-label": "Manual shortcut entry", children: [_jsxs("div", { className: "ib-manual-binding-heading", children: [_jsx("strong", { children: "Enter shortcut manually" }), _jsx("span", { children: "Use this on touch devices or whenever hardware-key capture is inconvenient." })] }), _jsxs("div", { className: "ib-manual-binding-grid", children: [_jsxs("label", { className: "ib-manual-key", children: [_jsx("span", { children: mode === "physical" ? "Key code" : "Key" }), _jsx("input", { type: "text", value: manualKey, list: manualKeyListId, autoCapitalize: "none", autoCorrect: "off", spellCheck: false, placeholder: mode === "physical" ? "KeyW, Space, ArrowLeft…" : "s, Escape, Enter…", "aria-label": "Manual key or code", onChange: (event) => setManualKey(event.target.value), onKeyDown: (event) => {
                                                            if (event.key === "Enter" && manualStroke) {
                                                                event.preventDefault();
                                                                applyManualStroke(true);
                                                            }
                                                        } }), _jsxs("datalist", { id: manualKeyListId, children: [_jsx("option", { value: "Escape" }), _jsx("option", { value: "Enter" }), _jsx("option", { value: "Tab" }), _jsx("option", { value: "Space" }), _jsx("option", { value: "Backspace" }), _jsx("option", { value: "Delete" }), _jsx("option", { value: "ArrowUp" }), _jsx("option", { value: "ArrowDown" }), _jsx("option", { value: "ArrowLeft" }), _jsx("option", { value: "ArrowRight" }), _jsx("option", { value: "Home" }), _jsx("option", { value: "End" })] })] }), _jsxs("fieldset", { className: "ib-manual-modifiers", children: [_jsx("legend", { children: "Modifiers" }), ["ctrl", "alt", "shift", "meta", "altGraph"].map((modifier) => (_jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: Boolean(manualModifiers[modifier]), onChange: (event) => setManualModifiers((current) => ({
                                                                    ...current,
                                                                    [modifier]: event.target.checked || undefined,
                                                                })) }), _jsx("span", { children: {
                                                                    ctrl: "Ctrl",
                                                                    meta: "Meta",
                                                                    altGraph: "AltGraph",
                                                                    alt: "Alt",
                                                                    shift: "Shift",
                                                                }[modifier] })] }, modifier)))] })] }), _jsxs("div", { className: "ib-manual-binding-actions", children: [_jsx("button", { type: "button", disabled: !manualStroke, onClick: () => applyManualStroke(true), children: "Set shortcut" }), _jsx("button", { type: "button", disabled: !manualStroke || sequence.length >= 4, onClick: () => applyManualStroke(false), children: "Add chord step" })] })] }), _jsxs("dl", { className: "ib-recorder-facts", "aria-live": "polite", children: [_jsxs("div", { children: [_jsx("dt", { children: "Pressed now" }), _jsx("dd", { children: pressedCodes.size
                                                    ? [...pressedCodes]
                                                        .map((code) => keyboardLabelForCode(code, layoutLabels))
                                                        .join(" + ")
                                                    : "None" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Last registered" }), _jsx("dd", { children: lastAccepted ?? "None" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Sequence" }), _jsx("dd", { children: sequence.length ? formatSequence(sequence) : "Empty" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Mode" }), _jsx("dd", { children: mode === "physical" ? "Physical key position" : "Logical keyboard value" })] }), _jsxs("div", { children: [_jsx("dt", { children: "Context" }), _jsx("dd", { children: describeWhen(existingBinding?.when ?? (actionId ? { op: "always" } : undefined)) })] })] }), _jsx("p", { className: "ib-recorder-feedback", "aria-live": "polite", children: feedback }), previewConflicts.length > 0 && (_jsxs("div", { className: "ib-recorder-conflicts", children: [_jsxs("strong", { children: [previewConflicts.length, " conflict", previewConflicts.length === 1 ? "" : "s", " ", "detected"] }), _jsx("ul", { children: previewConflicts.map((conflict, index) => (_jsxs("li", { children: [conflictLabel(conflict.kind), conflict.witnessContexts?.length
                                                    ? ` when ${conflict.witnessContexts.join(", ")}`
                                                    : ""] }, `${conflict.kind}-${index}`))) })] })), _jsxs("div", { className: "ib-recorder-actions", children: [_jsx("button", { type: "button", onClick: () => captureRef.current?.focus(), children: "Focus recorder" }), _jsx("button", { type: "button", disabled: sequence.length === 0, onClick: () => setSequence((value) => value.slice(0, -1)), children: "Remove last" }), _jsx("button", { type: "button", disabled: sequence.length === 0, onClick: () => setSequence([]), children: "Clear" }), _jsx("button", { type: "button", disabled: sequence.length === 0, onClick: () => onSave(sequence), children: "Save" }), _jsx("button", { type: "button", onClick: onCancel, children: "Cancel" })] })] }), _jsxs("div", { className: "ib-recorder-keyboard", children: [_jsx("h3", { children: "Live keyboard" }), _jsx(KeyboardView, { bindings: allBindings, conflicts: allConflicts, selectedActionId: actionId, selectedBindingId: existingBinding?.id, scope: actionId ? "selectedAction" : "visible", pressedCodes: pressedCodes, highlightedSequence: sequence, layoutLabels: layoutLabels }), _jsx(KeyboardLegend, {})] })] })] }));
}
