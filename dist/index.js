import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { analyzeConflicts, compileActionRegistry, isKeyStroke, validateCompiledRegistry, } from "@moritzbrantner/input-bindings";
import { isModifierOnlyKeyboardValue, keyboardEventToStroke, normalizeLogicalKey, } from "@moritzbrantner/input-bindings-web";
import { useEffect, useId, useMemo, useRef, useState, } from "react";
import { KEYBOARD_ROWS, codesForSequence, createKeyboardBindingIndex, keyboardLabelForCode, } from "./keyboard.js";
import { contextsForWhen, createActionEditorIndex, describeWhen, formatSequence, formatStroke, nextBindingId, profileFromBindings, sequenceStartsWith, } from "./model.js";
export * from "./keyboard.js";
export * from "./model.js";
export function KeybindingEditor({ registry, profile, onProfileChange, compiledRegistry, presentation = "split", className, }) {
    const compiled = useMemo(() => compiledRegistry ?? compileActionRegistry(registry), [compiledRegistry, registry]);
    const report = useMemo(() => validateCompiledRegistry(compiled, profile), [compiled, profile]);
    const effectiveBindings = report.effectiveBindings;
    const layoutLabels = useKeyboardLayoutLabels();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");
    const [context, setContext] = useState("all");
    const [device, setDevice] = useState("all");
    const [changedFilter, setChangedFilter] = useState("all");
    const [conflictFilter, setConflictFilter] = useState("all");
    const [shortcutFilter, setShortcutFilter] = useState([]);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [shortcutRecorderOpen, setShortcutRecorderOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [transferOpen, setTransferOpen] = useState(false);
    const [selectedActionId, setSelectedActionId] = useState();
    const [selectedBindingId, setSelectedBindingId] = useState();
    const [keyboardScope, setKeyboardScope] = useState("visible");
    const [keyboardFilter, setKeyboardFilter] = useState(null);
    const actionById = useMemo(() => new Map(registry.actions.map((action) => [action.id, action])), [registry]);
    const bindingById = useMemo(() => new Map(effectiveBindings.map((binding) => [binding.id, binding])), [effectiveBindings]);
    const conflictsByBinding = useMemo(() => {
        const result = new Map();
        for (const conflict of report.conflicts) {
            for (const id of [conflict.leftBindingId, conflict.rightBindingId]) {
                const entries = result.get(id) ?? [];
                entries.push(conflict);
                result.set(id, entries);
            }
        }
        return result;
    }, [report.conflicts]);
    const actionIndex = useMemo(() => createActionEditorIndex(registry, effectiveBindings, report.conflicts), [effectiveBindings, registry, report.conflicts]);
    const sortedActions = useMemo(() => [...registry.actions].sort((left, right) => categoryLabel(left).localeCompare(categoryLabel(right)) ||
        left.title.localeCompare(right.title)), [registry]);
    const keyboardFilterIds = useMemo(() => new Set(keyboardFilter?.bindingIds ?? []), [keyboardFilter]);
    const categories = useMemo(() => [...new Set(registry.actions.map((action) => categoryLabel(action)).filter(Boolean))].sort(), [registry]);
    const contexts = useMemo(() => [...new Set(effectiveBindings.flatMap((binding) => contextsForWhen(binding.when)))].sort(), [effectiveBindings]);
    const devices = useMemo(() => [
        ...new Set(registry.actions.flatMap((action) => action.allowedDevices ?? [])),
    ].sort(), [registry]);
    const conflictKinds = useMemo(() => [...new Set(report.conflicts.map((conflict) => conflict.kind))].sort(), [report.conflicts]);
    const activeFilterCount = [
        category !== "all",
        context !== "all",
        device !== "all",
        changedFilter !== "all",
        conflictFilter !== "all",
    ].filter(Boolean).length;
    const filteredActions = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return sortedActions.filter((action) => {
            const metadata = actionIndex.get(action.id);
            if (!metadata) {
                return false;
            }
            const bindings = metadata.bindings;
            if (normalizedQuery && !metadata.searchText.includes(normalizedQuery)) {
                return false;
            }
            if (category !== "all" && categoryLabel(action) !== category) {
                return false;
            }
            if (context !== "all" && !metadata.contexts.has(context)) {
                return false;
            }
            if (device !== "all" && !(action.allowedDevices ?? []).includes(device)) {
                return false;
            }
            if (changedFilter === "changed" && !metadata.changed) {
                return false;
            }
            if (changedFilter === "default" && metadata.changed) {
                return false;
            }
            if (conflictFilter === "none" && metadata.conflictKinds.size > 0) {
                return false;
            }
            if (conflictFilter !== "all" &&
                conflictFilter !== "none" &&
                !metadata.conflictKinds.has(conflictFilter)) {
                return false;
            }
            if (shortcutFilter.length > 0 &&
                !bindings.some((binding) => sequenceStartsWith(binding.sequence, shortcutFilter))) {
                return false;
            }
            if (keyboardFilter && !bindings.some((binding) => keyboardFilterIds.has(binding.id))) {
                return false;
            }
            return true;
        });
    }, [
        actionIndex,
        sortedActions,
        query,
        category,
        context,
        device,
        changedFilter,
        conflictFilter,
        shortcutFilter,
        keyboardFilter,
        keyboardFilterIds,
    ]);
    const visibleActionIds = useMemo(() => filteredActions.map((action) => action.id), [filteredActions]);
    useEffect(() => {
        if (selectedActionId && !actionById.has(selectedActionId)) {
            setSelectedActionId(undefined);
            setSelectedBindingId(undefined);
        }
    }, [actionById, selectedActionId]);
    const applyBindings = (bindings) => {
        onProfileChange(profileFromBindings(registry, bindings, profile.id));
    };
    const saveBinding = (actionId, bindingId, sequence) => {
        if (bindingId) {
            const existing = bindingById.get(bindingId);
            if (!existing) {
                return;
            }
            applyBindings(effectiveBindings.map((binding) => binding.id === bindingId ? { ...binding, sequence: structuredClone(sequence) } : binding));
            setSelectedActionId(actionId);
            setSelectedBindingId(bindingId);
        }
        else {
            const binding = {
                id: nextBindingId(actionId, effectiveBindings),
                action: actionId,
                sequence: structuredClone(sequence),
                when: { op: "always" },
                priority: 0,
            };
            applyBindings([...effectiveBindings, binding]);
            setSelectedActionId(actionId);
            setSelectedBindingId(binding.id);
        }
        setEditing(null);
    };
    const removeBinding = (bindingId) => {
        applyBindings(effectiveBindings.filter((binding) => binding.id !== bindingId));
        if (selectedBindingId === bindingId) {
            setSelectedBindingId(undefined);
        }
    };
    const resetAction = (action) => {
        const otherBindings = effectiveBindings.filter((binding) => binding.action !== action.id);
        const defaults = (action.defaults ?? []).map((binding) => structuredClone(binding));
        applyBindings([...otherBindings, ...defaults]);
        setSelectedActionId(action.id);
        setSelectedBindingId(defaults[0]?.id);
    };
    const editingBinding = editing?.bindingId ? bindingById.get(editing.bindingId) : undefined;
    const editingSequence = editingBinding?.sequence.filter(isKeyStroke) ?? [];
    const selectedAction = selectedActionId ? actionById.get(selectedActionId) : undefined;
    const selectedBinding = selectedBindingId ? bindingById.get(selectedBindingId) : undefined;
    const selectedActionChanged = selectedAction
        ? (actionIndex.get(selectedAction.id)?.changed ?? false)
        : false;
    const selectedActionSupportsKeyboard = selectedAction
        ? (selectedAction.allowedDevices ?? []).includes("keyboard")
        : false;
    return (_jsxs("div", { className: [
            "ib-editor",
            presentation !== "split" ? `ib-editor-${presentation}` : "",
            className,
        ]
            .filter(Boolean)
            .join(" "), children: [_jsxs("div", { className: "ib-toolbar", "aria-label": "Keybinding filters", children: [_jsxs("label", { className: "ib-search", children: [_jsx("span", { children: "Search actions or shortcuts" }), _jsx("input", { type: "search", value: query, onChange: (event) => setQuery(event.target.value), placeholder: "Save, Ctrl+S, timeline\u2026" })] }), _jsxs("div", { className: "ib-shortcut-filter", children: [_jsx("button", { type: "button", onClick: () => setShortcutRecorderOpen(true), children: shortcutFilter.length ? formatSequence(shortcutFilter) : "Filter by pressed shortcut" }), shortcutFilter.length > 0 && (_jsx("button", { type: "button", onClick: () => setShortcutFilter([]), "aria-label": "Clear shortcut filter", children: "Clear" }))] }), _jsxs("button", { type: "button", className: "ib-mobile-filters-toggle", "aria-expanded": mobileFiltersOpen, "aria-controls": "ib-advanced-filters", onClick: () => setMobileFiltersOpen((open) => !open), children: ["Filters", activeFilterCount > 0 ? ` (${activeFilterCount})` : ""] }), _jsxs("div", { id: "ib-advanced-filters", className: ["ib-filter-grid", mobileFiltersOpen ? "is-open" : ""]
                            .filter(Boolean)
                            .join(" "), children: [_jsx(FilterSelect, { label: "Category", value: category, onChange: setCategory, options: categories }), _jsx(FilterSelect, { label: "Context", value: context, onChange: setContext, options: contexts }), _jsx(FilterSelect, { label: "Device", value: device, onChange: (value) => setDevice(value), options: devices }), _jsx(FilterSelect, { label: "Customization", value: changedFilter, onChange: (value) => setChangedFilter(value), options: ["changed", "default"] }), _jsx(FilterSelect, { label: "Conflict", value: conflictFilter, onChange: (value) => setConflictFilter(value), options: ["none", ...conflictKinds] })] }), _jsxs("div", { className: "ib-toolbar-actions", children: [keyboardFilter && (_jsxs("button", { type: "button", onClick: () => setKeyboardFilter(null), children: ["Clear keyboard filter: ", keyboardLabelForCode(keyboardFilter.code, layoutLabels)] })), _jsx("button", { type: "button", onClick: () => onProfileChange({ id: profile.id, patches: [] }), children: "Reset all" }), _jsx("button", { type: "button", onClick: () => setTransferOpen((open) => !open), children: "Import / export" })] })] }), !report.valid && (_jsxs("section", { className: "ib-diagnostics", "aria-labelledby": "ib-validation-heading", children: [_jsx("h2", { id: "ib-validation-heading", children: "Configuration needs attention" }), _jsx("ul", { children: report.diagnostics.map((diagnostic, index) => (_jsxs("li", { children: [diagnostic.kind, diagnostic.actionId ? ` · action ${diagnostic.actionId}` : "", diagnostic.bindingId ? ` · binding ${diagnostic.bindingId}` : ""] }, `${diagnostic.kind}-${diagnostic.bindingId ?? ""}-${index}`))) })] })), transferOpen && (_jsx(ProfileTransfer, { compiledRegistry: compiled, profile: profile, onApply: (next) => {
                    onProfileChange(next);
                    setTransferOpen(false);
                }, onClose: () => setTransferOpen(false) })), shortcutRecorderOpen && (_jsx(BindingRecorder, { title: "Shortcut filter", initialSequence: shortcutFilter, allBindings: effectiveBindings, allConflicts: report.conflicts, layoutLabels: layoutLabels, onCancel: () => setShortcutRecorderOpen(false), onSave: (sequence) => {
                    setShortcutFilter(sequence);
                    setShortcutRecorderOpen(false);
                } })), editing && (_jsx(BindingRecorder, { title: `${editing.bindingId ? "Edit" : "Add"} binding for ${actionById.get(editing.actionId)?.title ?? editing.actionId}`, initialSequence: editingSequence, allBindings: effectiveBindings, allConflicts: report.conflicts, actionId: editing.actionId, existingBinding: editingBinding, layoutLabels: layoutLabels, onCancel: () => setEditing(null), onSave: (sequence) => saveBinding(editing.actionId, editing.bindingId, sequence) })), _jsxs("div", { className: "ib-workspace", children: [presentation !== "keyboard" && (_jsxs("div", { className: "ib-table", role: "table", "aria-label": "Keybindings", children: [_jsxs("div", { className: "ib-table-head", role: "row", children: [_jsx("span", { role: "columnheader", children: "Action" }), _jsx("span", { role: "columnheader", children: "Bindings" }), _jsx("span", { role: "columnheader", children: "Details" })] }), filteredActions.map((action) => {
                                const metadata = actionIndex.get(action.id);
                                const bindings = metadata?.bindings ?? [];
                                const changed = metadata?.changed ?? false;
                                const canAddKeyboard = (action.allowedDevices ?? []).includes("keyboard");
                                const actionSelected = selectedActionId === action.id;
                                return (_jsxs("div", { className: ["ib-row", actionSelected ? "is-selected" : ""]
                                        .filter(Boolean)
                                        .join(" "), role: "row", onClick: () => {
                                        setSelectedActionId(action.id);
                                        if (keyboardScope === "visible") {
                                            setKeyboardScope("selectedAction");
                                        }
                                    }, children: [_jsxs("div", { className: "ib-action", role: "cell", children: [_jsxs("div", { className: "ib-action-title-line", children: [_jsx("strong", { children: action.title }), changed && _jsx("span", { className: "ib-state-label", children: "Changed" })] }), _jsx("code", { children: action.id }), action.description && _jsx("p", { children: action.description }), _jsx("span", { className: "ib-muted", children: categoryLabel(action) || "Uncategorized" })] }), _jsxs("div", { className: "ib-binding-list", role: "cell", children: [bindings.length === 0 && _jsx("span", { className: "ib-muted", children: "Unbound" }), bindings.map((binding) => (_jsx(BindingEntry, { binding: binding, selected: selectedBindingId === binding.id, conflicts: conflictsByBinding.get(binding.id) ?? [], bindingById: bindingById, actionById: actionById, onSelect: () => {
                                                        setSelectedActionId(action.id);
                                                        setSelectedBindingId(binding.id);
                                                        setKeyboardScope("selectedAction");
                                                    }, onEdit: binding.sequence.every(isKeyStroke)
                                                        ? () => setEditing({ actionId: action.id, bindingId: binding.id })
                                                        : undefined, onRemove: () => removeBinding(binding.id) }, binding.id))), _jsx("button", { type: "button", disabled: !canAddKeyboard, onClick: (event) => {
                                                        event.stopPropagation();
                                                        setSelectedActionId(action.id);
                                                        setEditing({ actionId: action.id });
                                                    }, children: "Add binding" })] }), _jsxs("div", { className: "ib-details", role: "cell", children: [_jsxs("span", { children: ["Repeat: ", action.repeatPolicy ?? "never"] }), _jsxs("span", { children: ["Devices: ", (action.allowedDevices ?? []).join(", ") || "none"] }), action.provenance && (_jsxs("span", { children: ["Source: ", action.provenance.source, action.provenance.version ? ` ${action.provenance.version}` : ""] })), changed && (_jsx("button", { type: "button", onClick: (event) => {
                                                        event.stopPropagation();
                                                        resetAction(action);
                                                    }, children: "Reset action" }))] })] }, action.id));
                            }), filteredActions.length === 0 && (_jsx("p", { className: "ib-empty", children: "No actions match the current filters." }))] })), presentation !== "list" && (_jsxs("aside", { className: "ib-keyboard-panel", "aria-labelledby": "ib-keyboard-heading", children: [_jsxs("div", { className: "ib-keyboard-panel-heading", children: [_jsxs("div", { children: [_jsx("h2", { id: "ib-keyboard-heading", children: "Keyboard overview" }), _jsx("p", { children: "Inspect occupied keys spatially. Logical shortcuts follow your browser keyboard layout when available; physical shortcuts stay on their exact key positions." })] }), _jsxs("label", { children: ["Show", _jsxs("select", { value: keyboardScope, onChange: (event) => setKeyboardScope(event.target.value), children: [_jsx("option", { value: "selectedAction", children: "Selected action" }), _jsx("option", { value: "context", children: "Current context filter" }), _jsx("option", { value: "visible", children: "Visible actions" }), _jsx("option", { value: "conflicts", children: "Conflicts only" })] })] })] }), _jsxs("div", { className: "ib-keyboard-selection", "aria-live": "polite", children: [_jsx("strong", { children: selectedAction?.title ?? "No action selected" }), selectedBindingId && _jsxs("span", { children: ["Binding: ", selectedBindingId] }), keyboardFilter && (_jsxs("span", { children: ["Keyboard selection: ", keyboardLabelForCode(keyboardFilter.code, layoutLabels), " \u00B7", " ", keyboardFilter.bindingIds.length, " binding(s)"] })), selectedAction && (_jsxs("div", { className: "ib-keyboard-selection-actions", "aria-label": "Selected shortcut actions", children: [selectedBinding?.sequence.every(isKeyStroke) && (_jsx("button", { type: "button", onClick: () => setEditing({ actionId: selectedAction.id, bindingId: selectedBinding.id }), children: "Edit binding" })), selectedBinding && (_jsx("button", { type: "button", onClick: () => removeBinding(selectedBinding.id), children: "Disable binding" })), _jsx("button", { type: "button", disabled: !selectedActionSupportsKeyboard, onClick: () => setEditing({ actionId: selectedAction.id }), children: "Add binding" }), selectedActionChanged && (_jsx("button", { type: "button", onClick: () => resetAction(selectedAction), children: "Reset action" }))] }))] }), _jsx(KeyboardView, { bindings: effectiveBindings, conflicts: report.conflicts, selectedActionId: selectedActionId, selectedBindingId: selectedBindingId, scope: keyboardScope, context: context === "all" ? undefined : context, visibleActionIds: visibleActionIds, layoutLabels: layoutLabels, onKeyInspect: (code, bindingIds) => {
                                    setKeyboardFilter(bindingIds.length ? { code, bindingIds } : null);
                                    const first = bindingIds[0] ? bindingById.get(bindingIds[0]) : undefined;
                                    if (first) {
                                        setSelectedBindingId(first.id);
                                        setSelectedActionId(first.action);
                                    }
                                    else {
                                        setSelectedBindingId(undefined);
                                        setSelectedActionId(undefined);
                                    }
                                } }), _jsx(KeyboardLegend, {})] }))] })] }));
}
function BindingEntry({ binding, selected, conflicts, bindingById, actionById, onSelect, onEdit, onRemove, }) {
    return (_jsxs("div", { className: ["ib-binding", selected ? "is-selected" : ""].filter(Boolean).join(" "), onClick: (event) => {
            event.stopPropagation();
            onSelect();
        }, children: [_jsxs("div", { className: "ib-binding-main", children: [_jsx("button", { type: "button", className: "ib-binding-shortcut", "aria-pressed": selected, onClick: onSelect, children: _jsx("kbd", { children: formatSequence(binding.sequence) }) }), _jsx("span", { className: "ib-context", children: describeWhen(binding.when) }), _jsx("button", { type: "button", disabled: !onEdit, title: onEdit ? undefined : "Keyboard recorder does not edit this device binding.", onClick: onEdit, children: "Edit" }), _jsx("button", { type: "button", onClick: onRemove, children: "Disable" })] }), conflicts.length > 0 && (_jsx("ul", { className: "ib-conflicts", children: conflicts.map((conflict) => {
                    const otherId = conflict.leftBindingId === binding.id
                        ? conflict.rightBindingId
                        : conflict.leftBindingId;
                    const other = bindingById.get(otherId);
                    const otherAction = other ? actionById.get(other.action) : undefined;
                    return (_jsxs("li", { children: [conflictLabel(conflict.kind), " with ", otherAction?.title ?? other?.action ?? otherId, conflict.witnessContexts?.length
                                ? ` when ${conflict.witnessContexts.join(", ")}`
                                : ""] }, `${conflict.kind}-${otherId}`));
                }) }))] }));
}
export function KeyboardView({ bindings, conflicts = [], selectedActionId, selectedBindingId, scope = "visible", context, visibleActionIds = [], pressedCodes = new Set(), highlightedSequence = [], layoutLabels, onKeyInspect, }) {
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
    return (_jsx("div", { className: "ib-keyboard", role: "group", "aria-label": "Keyboard binding overview", children: KEYBOARD_ROWS.map((row, rowIndex) => (_jsx("div", { className: "ib-keyboard-row", children: row.map((key) => (_jsx(KeyboardKey, { definition: key, scopedBindingIds: scopedBindingIdsByCode.get(key.code) ?? [], allBindingIds: allBindingIdsByCode.get(key.code) ?? [], conflictIds: conflictIds, selected: selectedCodes.has(key.code), pressed: pressedCodes.has(key.code), highlighted: highlightedCodes.has(key.code), layoutLabels: layoutLabels, onInspect: onKeyInspect }, key.code))) }, rowIndex))) }));
}
function KeyboardKey({ definition, scopedBindingIds, allBindingIds, conflictIds, selected, pressed, highlighted, layoutLabels, onInspect, }) {
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
    const content = (_jsxs(_Fragment, { children: [_jsx("span", { className: "ib-key-label", children: label }), allBindingIds.length > 0 && _jsx("span", { className: "ib-key-count", children: allBindingIds.length })] }));
    if (onInspect) {
        return (_jsx("button", { type: "button", className: classes, "data-key-code": definition.code, style: { flex: definition.width ?? 1 }, title: `${definition.code}: ${detail}`, "aria-label": `${label}, ${detail}${conflicting ? ", conflict" : ""}`, onClick: () => onInspect(definition.code, [...allBindingIds]), children: content }));
    }
    return (_jsx("div", { className: classes, "data-key-code": definition.code, style: { flex: definition.width ?? 1 }, title: `${definition.code}: ${detail}`, "aria-hidden": "true", children: content }));
}
function KeyboardLegend() {
    return (_jsxs("div", { className: "ib-keyboard-legend", "aria-label": "Keyboard overview legend", children: [_jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-used" }), " Used"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-selected" }), " Selected"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-conflict" }), " Conflict"] }), _jsxs("span", { children: [_jsx("i", { className: "ib-legend-swatch is-pressed" }), " Pressed now"] })] }));
}
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
function BindingRecorder({ title, initialSequence, allBindings, allConflicts, actionId, existingBinding, layoutLabels, onSave, onCancel, }) {
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
            setPressedCodes((current) => new Set([...current, event.code]));
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
function ProfileTransfer({ compiledRegistry, profile, onApply, onClose, }) {
    const [draft, setDraft] = useState(() => JSON.stringify(profile, null, 2));
    const preview = useMemo(() => parseProfilePreview(compiledRegistry, draft), [compiledRegistry, draft]);
    return (_jsxs("section", { className: "ib-transfer", "aria-labelledby": "ib-transfer-title", children: [_jsx("h2", { id: "ib-transfer-title", children: "Import / export profile" }), _jsx("p", { children: "Profiles contain only user deltas over consumer-owned defaults." }), _jsx("textarea", { value: draft, onChange: (event) => setDraft(event.target.value), rows: 14, spellCheck: false }), _jsxs("div", { className: "ib-transfer-preview", "aria-live": "polite", children: [preview.error && _jsxs("strong", { children: ["Cannot import: ", preview.error] }), !preview.error && preview.report?.valid && (_jsxs("span", { children: ["Preview valid. ", preview.profile?.patches.length ?? 0, " patches will be applied."] })), !preview.error && !preview.report?.valid && (_jsxs("span", { children: ["Preview rejected: ", preview.report?.diagnostics.map((item) => item.kind).join(", ")] }))] }), _jsxs("div", { className: "ib-recorder-actions", children: [_jsx("button", { type: "button", disabled: !preview.profile || !preview.report?.valid, onClick: () => preview.profile && onApply(preview.profile), children: "Apply imported profile" }), _jsx("button", { type: "button", onClick: () => setDraft(JSON.stringify(profile, null, 2)), children: "Restore current JSON" }), _jsx("button", { type: "button", onClick: onClose, children: "Close" })] })] }));
}
function FilterSelect({ label, value, onChange, options, }) {
    return (_jsxs("label", { className: "ib-filter-select", children: [_jsx("span", { children: label }), _jsxs("select", { value: value, onChange: (event) => onChange(event.target.value), children: [_jsx("option", { value: "all", children: "All" }), options.map((option) => (_jsx("option", { value: option, children: prettyLabel(option) }, option)))] })] }));
}
function parseProfilePreview(compiledRegistry, draft) {
    try {
        const value = JSON.parse(draft);
        if (!isProfile(value)) {
            return { error: "JSON is not a profile with an id and patches array." };
        }
        try {
            return { profile: value, report: validateCompiledRegistry(compiledRegistry, value) };
        }
        catch (error) {
            return { error: error instanceof Error ? error.message : "Profile validation failed." };
        }
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : "Invalid JSON." };
    }
}
function isProfile(value) {
    if (!value || typeof value !== "object") {
        return false;
    }
    const candidate = value;
    return typeof candidate.id === "string" && Array.isArray(candidate.patches);
}
function categoryLabel(action) {
    return (action.categoryPath ?? []).join(" / ");
}
function conflictLabel(kind) {
    const labels = {
        duplicate: "Duplicate binding",
        ambiguousExact: "Ambiguous binding",
        overrideExact: "Contextual/priority override",
        chordPrefix: "Chord prefix overlap",
        potentialExact: "Potential exact conflict",
        potentialPrefix: "Potential chord-prefix conflict",
    };
    return labels[kind];
}
function prettyLabel(value) {
    return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}
function useKeyboardLayoutLabels() {
    const [labels, setLabels] = useState(() => new Map());
    useEffect(() => {
        let cancelled = false;
        const keyboard = navigator.keyboard;
        if (!keyboard?.getLayoutMap) {
            return;
        }
        keyboard
            .getLayoutMap()
            .then((layoutMap) => {
            if (!cancelled) {
                setLabels(new Map(layoutMap));
            }
        })
            .catch(() => {
            /* Physical fallback remains usable. */
        });
        return () => {
            cancelled = true;
        };
    }, []);
    return labels;
}
