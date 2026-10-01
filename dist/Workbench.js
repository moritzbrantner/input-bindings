import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { applyConflictRepair, compileActionRegistry, explainResolutionWithContextStack, validateCompiledRegistry, } from "@moritzbrantner/input-bindings";
import { keyboardEventToStroke } from "@moritzbrantner/input-bindings-web";
import { useEffect, useMemo, useRef, useState, } from "react";
import { ConflictRepairPanel } from "./ConflictRepairPanel.js";
import { KeyboardView, KeybindingEditor } from "./index.js";
import { createStarterMobileControlsOverlay, MobileControlsView, } from "./MobileControlsView.js";
import { formatSequence, profileFromBindings } from "./model.js";
import { ResolutionInspector } from "./ResolutionInspector.js";
import { bindingsForScenario, deriveContextScenarios, scenarioContextFacts, } from "./workbench-model.js";
export { createStarterMobileControlsOverlay, MobileControlsView } from "./MobileControlsView.js";
export { MobileControlsRuntimeSurface } from "./MobileControlsRuntimeSurface.js";
const DEFAULT_SCENARIO = {
    id: "global",
    label: "Global",
    activeContexts: [],
    stack: [],
    defaultKeyboardMode: "logical",
};
const DEFAULT_MOBILE_OVERLAY = createStarterMobileControlsOverlay();
const COMPACT_PRESENTATION_QUERY = "(max-width: 620px)";
export function InputBindingsWorkbench({ registry, profile, onProfileChange, contextScenarios, title = "Controls", description = "Browse, customize, and test application input from one reusable settings surface.", initialView = "bindings", initialMode, initialPresentation, mobileOverlay = DEFAULT_MOBILE_OVERLAY, mobileAnalogActions, onMobileOverlayChange, onMobileActionInput, onMobileAnalogInput, className, }) {
    const compiledRegistry = useMemo(() => compileActionRegistry(registry), [registry]);
    const report = useMemo(() => validateCompiledRegistry(compiledRegistry, profile), [compiledRegistry, profile]);
    const effectiveBindings = report.effectiveBindings;
    const actionById = useMemo(() => new Map(registry.actions.map((action) => [action.id, action])), [registry]);
    const bindingById = useMemo(() => new Map(effectiveBindings.map((binding) => [binding.id, binding])), [effectiveBindings]);
    const scenarios = useMemo(() => contextScenarios && contextScenarios.length > 0
        ? contextScenarios.map((scenario) => cloneScenario(scenario))
        : deriveContextScenarios(effectiveBindings), [contextScenarios, effectiveBindings]);
    const [mode, setMode] = useState(initialMode ?? modeForView(initialView));
    const [presentation, setPresentation] = useState(initialPresentation ?? (initialView === "keyboard" ? "keyboard" : "list"));
    const compactPresentation = useCompactControlsPresentation();
    const visibleMode = compactPresentation && mode === "preview" ? "shortcuts" : mode;
    const keyboardPresentation = compactPresentation ? "mobile" : "keyboard";
    const visiblePresentation = presentation === "list" ? "list" : keyboardPresentation;
    const [scenarioId, setScenarioId] = useState(() => scenarios[0]?.id ?? DEFAULT_SCENARIO.id);
    const scenario = scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0] ?? DEFAULT_SCENARIO;
    const [keyboardMode, setKeyboardMode] = useState(scenario.defaultKeyboardMode ?? "logical");
    useEffect(() => {
        if (!scenarios.some((candidate) => candidate.id === scenarioId)) {
            setScenarioId(scenarios[0]?.id ?? DEFAULT_SCENARIO.id);
        }
    }, [scenarioId, scenarios]);
    useEffect(() => {
        if (compactPresentation && mode === "preview") {
            setMode("shortcuts");
        }
    }, [compactPresentation, mode]);
    useEffect(() => {
        setKeyboardMode(scenario.defaultKeyboardMode ?? "logical");
    }, [scenario.id, scenario.defaultKeyboardMode]);
    const activeBindings = useMemo(() => bindingsForScenario(effectiveBindings, scenario), [effectiveBindings, scenario]);
    const activeContexts = useMemo(() => scenarioContextFacts(scenario), [scenario]);
    const applyRepair = (repair) => {
        const repaired = applyConflictRepair(effectiveBindings, repair);
        onProfileChange(profileFromBindings(registry, repaired, profile.id));
    };
    return (_jsxs("section", { className: ["ib-workbench", className].filter(Boolean).join(" "), children: [_jsxs("header", { className: "ib-workbench-header", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Input settings" }), _jsx("h1", { children: title }), _jsx("p", { children: description }), _jsxs("p", { className: "ib-workbench-summary", children: [registry.actions.length, " actions \u00B7 ", effectiveBindings.length, " bindings \u00B7", " ", report.conflicts.length, " conflict", report.conflicts.length === 1 ? "" : "s"] })] }), _jsx(WorkbenchTabs, { mode: visibleMode, compact: compactPresentation, onChange: setMode })] }), visibleMode === "shortcuts" && (_jsxs("div", { id: "ib-workbench-panel-shortcuts", role: "tabpanel", "aria-labelledby": "ib-workbench-tab-shortcuts", className: "ib-workbench-panel", children: [_jsx(PresentationToolbar, { presentation: visiblePresentation, compact: compactPresentation, onChange: setPresentation }), visiblePresentation === "mobile" ? (_jsx(MobileControlsView, { registry: registry, overlay: mobileOverlay, analogActions: mobileAnalogActions, onOverlayChange: onMobileOverlayChange, onActionInput: onMobileActionInput, onAnalogInput: onMobileAnalogInput })) : (_jsx(KeybindingEditor, { registry: registry, profile: profile, onProfileChange: onProfileChange, compiledRegistry: compiledRegistry, presentation: visiblePresentation }))] })), visibleMode === "conflicts" && (_jsx("div", { id: "ib-workbench-panel-conflicts", role: "tabpanel", "aria-labelledby": "ib-workbench-tab-conflicts", className: "ib-workbench-panel", children: _jsx(ConflictRepairPanel, { bindings: effectiveBindings, conflicts: report.conflicts, actions: actionById, scenarios: scenarios, onApplyRepair: applyRepair }) })), visibleMode === "preview" && (_jsxs("div", { id: "ib-workbench-panel-preview", role: "tabpanel", "aria-labelledby": "ib-workbench-tab-preview", className: "ib-workbench-panel", children: [_jsx(ScenarioToolbar, { scenarios: scenarios, scenario: scenario, onScenarioChange: setScenarioId, keyboardMode: keyboardMode, onKeyboardModeChange: setKeyboardMode }), _jsx(PreviewMode, { bindings: effectiveBindings, activeBindings: activeBindings, actions: actionById, bindingById: bindingById, conflicts: report.conflicts, activeContexts: activeContexts, scenario: scenario, keyboardMode: keyboardMode })] }))] }));
}
function WorkbenchTabs({ mode, compact, onChange, }) {
    const tabs = compact
        ? [
            {
                id: "shortcuts",
                label: "Bindings",
                description: "Browse bindings or arrange the mobile control overlay.",
            },
            {
                id: "conflicts",
                label: "Conflicts",
                description: "Understand overlaps and apply explicit deterministic repairs.",
            },
        ]
        : [
            {
                id: "shortcuts",
                label: "Shortcuts",
                description: "Browse and edit shortcuts in either list or keyboard presentation.",
            },
            {
                id: "conflicts",
                label: "Conflicts",
                description: "Understand overlaps and apply explicit deterministic repairs.",
            },
            {
                id: "preview",
                label: "Try shortcuts",
                description: "Press real keys and inspect exactly why the current context resolves them.",
            },
        ];
    const tabRefs = useRef([]);
    const activate = (index) => {
        const normalizedIndex = (index + tabs.length) % tabs.length;
        const tab = tabs[normalizedIndex];
        if (!tab) {
            return;
        }
        onChange(tab.id);
        queueMicrotask(() => tabRefs.current[normalizedIndex]?.focus());
    };
    return (_jsx("div", { className: "ib-workbench-tabs", role: "tablist", "aria-label": "Input settings tasks", children: tabs.map((tab, index) => (_jsx("button", { ref: (element) => {
                tabRefs.current[index] = element;
            }, id: `ib-workbench-tab-${tab.id}`, type: "button", role: "tab", "aria-selected": mode === tab.id, "aria-controls": `ib-workbench-panel-${tab.id}`, tabIndex: mode === tab.id ? 0 : -1, className: mode === tab.id ? "is-active" : undefined, title: tab.description, onClick: () => onChange(tab.id), onKeyDown: (event) => {
                switch (event.key) {
                    case "ArrowRight":
                        event.preventDefault();
                        activate(index + 1);
                        break;
                    case "ArrowLeft":
                        event.preventDefault();
                        activate(index - 1);
                        break;
                    case "Home":
                        event.preventDefault();
                        activate(0);
                        break;
                    case "End":
                        event.preventDefault();
                        activate(tabs.length - 1);
                        break;
                }
            }, children: tab.label }, tab.id))) }));
}
function PresentationToolbar({ presentation, compact, onChange, }) {
    return (_jsxs("section", { className: "ib-presentation-toolbar", "aria-label": "Shortcut presentation", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Presentation" }), _jsx("h2", { children: "Choose how to configure the same actions" }), _jsx("p", { children: "The action registry stays authoritative while the device-specific presentation changes." })] }), _jsxs("fieldset", { className: "ib-mode-switch", children: [_jsx("legend", { children: "View" }), _jsx("button", { type: "button", "aria-pressed": presentation === "list", className: presentation === "list" ? "is-active" : undefined, onClick: () => onChange("list"), children: "List" }), _jsx("button", { type: "button", "aria-pressed": presentation === (compact ? "mobile" : "keyboard"), className: presentation === (compact ? "mobile" : "keyboard") ? "is-active" : undefined, onClick: () => onChange("keyboard"), children: compact ? "Mobile controls" : "Keyboard" })] })] }));
}
function useCompactControlsPresentation() {
    // Keep the server render and the browser's first render identical. Responsive
    // presentation is applied after hydration from the actual media query.
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const media = window.matchMedia(COMPACT_PRESENTATION_QUERY);
        const update = () => setCompact(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);
    return compact;
}
function ScenarioToolbar({ scenarios, scenario, onScenarioChange, keyboardMode, onKeyboardModeChange, }) {
    return (_jsxs("section", { className: "ib-scenario-toolbar", "aria-label": "Preview context", children: [_jsxs("label", { children: [_jsx("span", { children: "Application context" }), _jsx("select", { value: scenario.id, onChange: (event) => onScenarioChange(event.target.value), children: scenarios.map((candidate) => (_jsx("option", { value: candidate.id, children: candidate.label }, candidate.id))) })] }), _jsxs("div", { className: "ib-scenario-description", children: [_jsx("strong", { children: scenario.label }), _jsx("span", { children: scenario.description ?? "Preview this configured application state." }), _jsx(ContextStackSummary, { scenario: scenario })] }), _jsxs("fieldset", { className: "ib-mode-switch", children: [_jsx("legend", { children: "Keyboard matching" }), _jsx("button", { type: "button", "aria-pressed": keyboardMode === "logical", className: keyboardMode === "logical" ? "is-active" : undefined, onClick: () => onKeyboardModeChange("logical"), children: "Logical key" }), _jsx("button", { type: "button", "aria-pressed": keyboardMode === "physical", className: keyboardMode === "physical" ? "is-active" : undefined, onClick: () => onKeyboardModeChange("physical"), children: "Physical position" })] })] }));
}
function ContextStackSummary({ scenario }) {
    const stack = scenario.stack ?? [];
    const facts = (scenario.activeContexts ?? []).filter((context) => !stack.some((layer) => layer.id === context));
    if (stack.length === 0 && facts.length === 0) {
        return _jsx("small", { children: "No application context is active." });
    }
    return (_jsxs("small", { children: [stack.length > 0 && (_jsxs("span", { className: "ib-context-stack", children: ["Stack:", " ", stack.map((layer) => `${layer.id}${layer.blocksLower ? " (modal)" : ""}`).join(" → ")] })), facts.length > 0 && _jsxs("span", { children: ["Facts: ", facts.join(", ")] })] }));
}
function PreviewMode({ bindings, activeBindings, actions, bindingById, conflicts, activeContexts, scenario, keyboardMode, }) {
    const captureRef = useRef(null);
    const historyIdRef = useRef(0);
    const [capturing, setCapturing] = useState(false);
    const [pressedCodes, setPressedCodes] = useState(() => new Set());
    const [sequence, setSequence] = useState([]);
    const [trace, setTrace] = useState(() => explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []));
    const [history, setHistory] = useState([]);
    useEffect(() => {
        setPressedCodes(new Set());
        setSequence([]);
        setTrace(explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []));
        setHistory([]);
        historyIdRef.current = 0;
        setCapturing(false);
    }, [keyboardMode, scenario, bindings, activeContexts]);
    const startCapture = () => {
        setCapturing(true);
        queueMicrotask(() => captureRef.current?.focus());
    };
    const stopCapture = () => {
        setCapturing(false);
        setPressedCodes(new Set());
    };
    const onKeyDown = (event) => {
        if (!capturing) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.code) {
            setPressedCodes((current) => new Set([...current, event.code]));
        }
        if (event.repeat || event.nativeEvent.isComposing) {
            return;
        }
        const stroke = keyboardEventToStroke(event.nativeEvent, {
            mode: keyboardMode,
            respectDefaultPrevented: false,
            ignoreComposing: true,
        });
        if (!stroke) {
            return;
        }
        let nextSequence = trace.resolution.kind === "pending" ? [...sequence, stroke] : [stroke];
        let nextTrace = explainResolutionWithContextStack(bindings, nextSequence, activeContexts, scenario.stack ?? []);
        if (trace.resolution.kind === "pending" && nextTrace.resolution.kind === "none") {
            nextSequence = [stroke];
            nextTrace = explainResolutionWithContextStack(bindings, nextSequence, activeContexts, scenario.stack ?? []);
        }
        setSequence(nextSequence);
        setTrace(nextTrace);
        historyIdRef.current += 1;
        const historyEntry = {
            id: historyIdRef.current,
            normalized: formatSequence([stroke]),
            physicalCode: event.code || "Unidentified",
            result: resolutionHistoryLabel(nextTrace, actions, bindingById),
        };
        setHistory((current) => [historyEntry, ...current].slice(0, 8));
    };
    const onKeyUp = (event) => {
        if (!event.code) {
            return;
        }
        setPressedCodes((current) => {
            const next = new Set(current);
            next.delete(event.code);
            return next;
        });
    };
    const clearTrace = () => {
        setSequence([]);
        setTrace(explainResolutionWithContextStack(bindings, [], activeContexts, scenario.stack ?? []));
        setHistory([]);
        historyIdRef.current = 0;
        captureRef.current?.focus();
    };
    return (_jsx("div", { className: "ib-preview-layout", children: _jsxs("section", { ref: captureRef, className: ["ib-preview-surface", capturing ? "is-capturing" : ""]
                .filter(Boolean)
                .join(" "), tabIndex: 0, onKeyDown: onKeyDown, onKeyUp: onKeyUp, onBlur: () => setPressedCodes(new Set()), "aria-label": "Interactive keyboard shortcut preview", children: [_jsxs("div", { className: "ib-section-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Interactive preview" }), _jsx("h2", { children: "Press your actual keyboard" })] }), _jsxs("div", { className: "ib-preview-actions", children: [!capturing ? (_jsx("button", { type: "button", className: "ib-primary-button", onClick: startCapture, children: "Start preview" })) : (_jsx("button", { type: "button", onClick: stopCapture, children: "Stop preview" })), _jsx("button", { type: "button", onClick: clearTrace, children: "Clear" })] })] }), _jsx("p", { className: "ib-preview-instruction", children: capturing
                        ? "Preview is active. Browser shortcuts are suppressed while this panel has focus."
                        : "Start preview, then press a shortcut. The physical keys will light up and the resolver evidence will be explained below." }), _jsx(KeyboardView, { bindings: activeBindings, conflicts: conflicts, pressedCodes: pressedCodes, highlightedSequence: sequence.filter((stroke) => "key" in stroke) }), _jsx(ResolutionPanel, { resolution: trace.resolution, sequence: sequence, actions: actions, bindingById: bindingById, keyboardMode: keyboardMode }), _jsx(ResolutionInspector, { trace: trace, history: history, actions: actions, bindingById: bindingById })] }) }));
}
function ResolutionPanel({ resolution, sequence, actions, bindingById, keyboardMode, }) {
    let title = "Waiting for input";
    let detail = `Matching ${keyboardMode === "logical" ? "logical key values" : "physical key positions"}.`;
    let tone = "idle";
    if (sequence.length > 0) {
        switch (resolution.kind) {
            case "none":
                title = "No active binding";
                detail = `${formatSequence(sequence)} does not resolve in this context.`;
                tone = "none";
                break;
            case "resolved": {
                const action = actions.get(resolution.action);
                title = action?.title ?? resolution.action;
                detail = `${formatSequence(sequence)} resolves to ${resolution.action}.`;
                tone = "resolved";
                break;
            }
            case "ambiguous": {
                const actionTitles = [
                    ...new Set(resolution.bindingIds.map((bindingId) => {
                        const binding = bindingById.get(bindingId);
                        return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
                    })),
                ];
                title = "Ambiguous shortcut";
                detail = `${formatSequence(sequence)} matches ${actionTitles.join(", ")}.`;
                tone = "ambiguous";
                break;
            }
            case "pending": {
                const continuationActions = [
                    ...new Set(resolution.continuationBindingIds.map((bindingId) => {
                        const binding = bindingById.get(bindingId);
                        return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
                    })),
                ];
                title = "Waiting for the next key";
                detail = `${formatSequence(sequence)} is a chord prefix${continuationActions.length ? ` for ${continuationActions.join(", ")}` : ""}.`;
                tone = "pending";
                break;
            }
        }
    }
    return (_jsxs("div", { className: `ib-resolution is-${tone}`, "aria-live": "polite", children: [_jsx("span", { className: "ib-resolution-label", children: "Result" }), _jsx("strong", { children: title }), _jsx("p", { children: detail })] }));
}
function resolutionHistoryLabel(trace, actions, bindingById) {
    switch (trace.resolution.kind) {
        case "none":
            return "No active binding";
        case "resolved":
            return actions.get(trace.resolution.action)?.title ?? trace.resolution.action;
        case "pending":
            return `Waiting for chord (${trace.resolution.continuationBindingIds.length} continuation${trace.resolution.continuationBindingIds.length === 1 ? "" : "s"})`;
        case "ambiguous": {
            const actionNames = [
                ...new Set(trace.resolution.bindingIds.map((bindingId) => {
                    const binding = bindingById.get(bindingId);
                    return binding ? (actions.get(binding.action)?.title ?? binding.action) : bindingId;
                })),
            ];
            return `Ambiguous: ${actionNames.join(", ")}`;
        }
    }
}
function cloneScenario(scenario) {
    return {
        ...scenario,
        activeContexts: [...(scenario.activeContexts ?? [])],
        stack: (scenario.stack ?? []).map((layer) => ({ ...layer })),
    };
}
function modeForView(view) {
    if (view === "conflicts" || view === "preview") {
        return view;
    }
    return "shortcuts";
}
