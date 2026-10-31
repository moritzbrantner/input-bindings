import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { compileActionRegistry, isKeyStroke, validateCompiledRegistry, } from "@moritzbrantner/input-bindings";
import { useEffect, useMemo, useState } from "react";
import { BindingRecorder } from "./BindingRecorder.js";
import { conflictLabel } from "./conflict-label.js";
import { keyboardLabelForCode } from "./keyboard.js";
import { KeyboardLegend, KeyboardView } from "./KeyboardView.js";
import { contextsForWhen, createActionEditorIndex, describeWhen, formatSequence, nextBindingId, profileFromBindings, sequenceStartsWith, } from "./model.js";
import { ProfileTransfer } from "./ProfileTransfer.js";
import { useKeyboardLayoutLabels } from "./useKeyboardLayoutLabels.js";
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
function FilterSelect({ label, value, onChange, options, }) {
    return (_jsxs("label", { className: "ib-filter-select", children: [_jsx("span", { children: label }), _jsxs("select", { value: value, onChange: (event) => onChange(event.target.value), children: [_jsx("option", { value: "all", children: "All" }), options.map((option) => (_jsx("option", { value: option, children: prettyLabel(option) }, option)))] })] }));
}
function categoryLabel(action) {
    return (action.categoryPath ?? []).join(" / ");
}
function prettyLabel(value) {
    return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}
