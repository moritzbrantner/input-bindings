import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, } from "react";
import { MobileControlsRuntimeSurface, } from "./MobileControlsRuntimeSurface.js";
const CONTROL_DEFAULTS = {
    stick: {
        kind: "stick",
        label: "Move",
        x: 5,
        y: 47,
        width: 24,
        height: 42,
    },
    button: {
        kind: "button",
        label: "Action",
        x: 80,
        y: 58,
        width: 12,
        height: 22,
    },
    gestureZone: {
        kind: "gestureZone",
        label: "Camera / gesture",
        x: 41,
        y: 18,
        width: 36,
        height: 43,
    },
    dock: {
        kind: "dock",
        label: "Commands",
        x: 35,
        y: 86,
        width: 30,
        height: 10,
    },
};
export function createStarterMobileControlsOverlay() {
    return {
        orientation: "landscape",
        controls: [
            { id: "movement-stick", ...CONTROL_DEFAULTS.stick },
            {
                id: "primary-action",
                ...CONTROL_DEFAULTS.button,
                label: "A",
                x: 81,
                y: 52,
                width: 14,
                height: 24,
            },
            {
                id: "secondary-action",
                ...CONTROL_DEFAULTS.button,
                label: "B",
                x: 65,
                y: 70,
                width: 14,
                height: 24,
            },
            {
                id: "camera-zone",
                ...CONTROL_DEFAULTS.gestureZone,
                label: "Look",
            },
            {
                id: "command-dock",
                ...CONTROL_DEFAULTS.dock,
                label: "Menu",
                y: 75,
                height: 22,
            },
        ],
    };
}
export function MobileControlsView({ registry, overlay, analogActions = [], onOverlayChange, onActionInput, onAnalogInput, }) {
    const frameRef = useRef(null);
    const dragRef = useRef(null);
    const [selectedId, setSelectedId] = useState(() => overlay.controls[0]?.id);
    const [testing, setTesting] = useState(false);
    const selected = overlay.controls.find((control) => control.id === selectedId);
    const actionById = useMemo(() => new Map(registry.actions.map((action) => [action.id, action])), [registry]);
    const sortedActions = useMemo(() => [...registry.actions].sort((left, right) => left.title.localeCompare(right.title)), [registry]);
    const sortedAnalogActions = useMemo(() => [...analogActions].sort((left, right) => left.title.localeCompare(right.title)), [analogActions]);
    const editable = Boolean(onOverlayChange);
    useEffect(() => {
        if (selectedId && !overlay.controls.some((control) => control.id === selectedId)) {
            setSelectedId(overlay.controls[0]?.id);
        }
    }, [overlay.controls, selectedId]);
    const updateControl = (id, patch) => {
        if (!onOverlayChange) {
            return;
        }
        onOverlayChange({
            ...overlay,
            controls: overlay.controls.map((control) => control.id === id ? constrainControl({ ...control, ...patch }) : control),
        });
    };
    const setOrientation = (orientation) => {
        if (!onOverlayChange || overlay.orientation === orientation) {
            return;
        }
        onOverlayChange({ ...overlay, orientation });
    };
    const addControl = (kind) => {
        if (!onOverlayChange) {
            return;
        }
        const id = nextControlId(kind, overlay.controls);
        const offset = (overlay.controls.length % 4) * 2;
        const control = constrainControl({
            id,
            ...CONTROL_DEFAULTS[kind],
            x: CONTROL_DEFAULTS[kind].x + offset,
            y: CONTROL_DEFAULTS[kind].y + offset,
        });
        onOverlayChange({ ...overlay, controls: [...overlay.controls, control] });
        setSelectedId(id);
    };
    const removeSelected = () => {
        if (!onOverlayChange || !selected) {
            return;
        }
        const nextControls = overlay.controls.filter((control) => control.id !== selected.id);
        onOverlayChange({ ...overlay, controls: nextControls });
        setSelectedId(nextControls[0]?.id);
    };
    const startDrag = (event, control) => {
        setSelectedId(control.id);
        if (!editable) {
            return;
        }
        const controlRect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
            id: control.id,
            pointerId: event.pointerId,
            offsetX: event.clientX - controlRect.left,
            offsetY: event.clientY - controlRect.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
    };
    const moveDrag = (event) => {
        const drag = dragRef.current;
        const frame = frameRef.current;
        const control = drag
            ? overlay.controls.find((candidate) => candidate.id === drag.id)
            : undefined;
        if (!drag || !frame || !control || drag.pointerId !== event.pointerId) {
            return;
        }
        const frameRect = frame.getBoundingClientRect();
        const x = ((event.clientX - frameRect.left - drag.offsetX) / frameRect.width) * 100;
        const y = ((event.clientY - frameRect.top - drag.offsetY) / frameRect.height) * 100;
        updateControl(control.id, { x, y });
    };
    const stopDrag = (event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
        }
    };
    const nudgeControl = (event, control) => {
        if (!editable) {
            return;
        }
        const step = event.shiftKey ? 5 : 1;
        let x = control.x;
        let y = control.y;
        switch (event.key) {
            case "ArrowLeft":
                x -= step;
                break;
            case "ArrowRight":
                x += step;
                break;
            case "ArrowUp":
                y -= step;
                break;
            case "ArrowDown":
                y += step;
                break;
            default:
                return;
        }
        event.preventDefault();
        updateControl(control.id, { x, y });
    };
    return (_jsxs("section", { className: "ib-mobile-controls", "aria-labelledby": "ib-mobile-controls-heading", children: [_jsxs("div", { className: "ib-mobile-controls-heading", children: [_jsxs("div", { children: [_jsx("p", { className: "ib-workbench-eyebrow", children: "Mobile overlay" }), _jsx("h2", { id: "ib-mobile-controls-heading", children: "Mobile controls" }), _jsx("p", { children: "Arrange touch controls over the application surface. Drag for coarse placement, then use exact percentage fields for precise positioning." })] }), _jsxs("div", { className: "ib-mobile-controls-modes", children: [(onActionInput || onAnalogInput) && (_jsxs("fieldset", { className: "ib-mode-switch", children: [_jsx("legend", { children: "Mode" }), _jsx("button", { type: "button", "aria-pressed": !testing, className: !testing ? "is-active" : undefined, onClick: () => setTesting(false), children: "Edit" }), _jsx("button", { type: "button", "aria-pressed": testing, className: testing ? "is-active" : undefined, onClick: () => setTesting(true), children: "Test" })] })), _jsxs("fieldset", { className: "ib-mode-switch", children: [_jsx("legend", { children: "Preview orientation" }), _jsx("button", { type: "button", "aria-pressed": overlay.orientation === "portrait", className: overlay.orientation === "portrait" ? "is-active" : undefined, disabled: !editable, onClick: () => setOrientation("portrait"), children: "Portrait" }), _jsx("button", { type: "button", "aria-pressed": overlay.orientation === "landscape", className: overlay.orientation === "landscape" ? "is-active" : undefined, disabled: !editable, onClick: () => setOrientation("landscape"), children: "Landscape" })] })] })] }), testing ? (_jsx(MobileControlsRuntimeSurface, { overlay: overlay, onActionInput: onActionInput, onAnalogInput: onAnalogInput })) : (_jsxs("div", { className: "ib-mobile-overlay-layout", children: [_jsxs("div", { className: "ib-mobile-overlay-workspace", children: [_jsxs("div", { ref: frameRef, className: "ib-mobile-overlay-frame", "data-orientation": overlay.orientation, "aria-label": "Mobile control overlay preview", children: [_jsx("div", { className: "ib-mobile-overlay-safe-area", "aria-hidden": "true" }), _jsx("div", { className: "ib-mobile-overlay-content", "aria-hidden": "true", children: _jsx("span", { children: "Application surface" }) }), overlay.controls.map((control) => {
                                        const action = control.actionId ? actionById.get(control.actionId) : undefined;
                                        const analogAction = control.analogActionId
                                            ? sortedAnalogActions.find((candidate) => candidate.id === control.analogActionId)
                                            : undefined;
                                        const style = {
                                            "--ib-mobile-x": `${control.x}%`,
                                            "--ib-mobile-y": `${control.y}%`,
                                            "--ib-mobile-width": `${control.width}%`,
                                            "--ib-mobile-height": `${control.height}%`,
                                        };
                                        return (_jsxs("button", { type: "button", className: [
                                                "ib-mobile-overlay-control",
                                                `is-${control.kind}`,
                                                selectedId === control.id ? "is-selected" : "",
                                            ]
                                                .filter(Boolean)
                                                .join(" "), style: style, "aria-pressed": selectedId === control.id, "aria-label": `${control.label} mobile control`, title: controlTitle(control.label, analogAction?.title ?? action?.title), onClick: () => setSelectedId(control.id), onPointerDown: (event) => startDrag(event, control), onPointerMove: moveDrag, onPointerUp: stopDrag, onPointerCancel: stopDrag, onKeyDown: (event) => nudgeControl(event, control), children: [control.kind === "stick" && (_jsx("span", { className: "ib-mobile-stick-knob", "aria-hidden": "true" })), _jsx("strong", { children: control.label }), control.kind === "gestureZone" && _jsx("small", { children: "drag / swipe" }), analogAction && _jsx("small", { children: analogAction.title }), !analogAction && action && _jsx("small", { children: action.title })] }, control.id));
                                    })] }), _jsxs("div", { className: "ib-mobile-control-palette", "aria-label": "Mobile control palette", children: [_jsx("button", { type: "button", disabled: !editable, onClick: () => addControl("stick"), children: "Add stick" }), _jsx("button", { type: "button", disabled: !editable, onClick: () => addControl("button"), children: "Add action button" }), _jsx("button", { type: "button", disabled: !editable, onClick: () => addControl("gestureZone"), children: "Add gesture zone" }), _jsx("button", { type: "button", disabled: !editable, onClick: () => addControl("dock"), children: "Add command dock" })] })] }), _jsxs("aside", { className: "ib-mobile-control-inspector", "aria-label": "Selected mobile control", children: [selected ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "ib-mobile-control-inspector-heading", children: [_jsxs("div", { children: [_jsx("span", { children: controlKindLabel(selected.kind) }), _jsx("strong", { children: selected.label })] }), _jsx("button", { type: "button", disabled: !editable, onClick: removeSelected, children: "Remove" })] }), _jsxs("label", { children: [_jsx("span", { children: "Label" }), _jsx("input", { value: selected.label, disabled: !editable, onChange: (event) => updateControl(selected.id, { label: event.target.value }) })] }), selected.kind === "stick" || selected.kind === "gestureZone" ? (_jsxs("label", { children: [_jsx("span", { children: "Analog action" }), sortedAnalogActions.length > 0 ? (_jsxs("select", { value: selected.analogActionId ?? "", disabled: !editable, onChange: (event) => updateControl(selected.id, {
                                                    analogActionId: event.target.value || undefined,
                                                }), children: [_jsx("option", { value: "", children: "No analog action" }), sortedAnalogActions.map((action) => (_jsx("option", { value: action.id, children: action.title }, action.id)))] })) : (_jsx("input", { value: selected.analogActionId ?? "", disabled: !editable, placeholder: "game.move", onChange: (event) => updateControl(selected.id, {
                                                    analogActionId: event.target.value || undefined,
                                                }) }))] })) : (_jsxs("label", { children: [_jsx("span", { children: "Semantic action" }), _jsxs("select", { value: selected.actionId ?? "", disabled: !editable, onChange: (event) => updateControl(selected.id, {
                                                    actionId: event.target.value || undefined,
                                                }), children: [_jsx("option", { value: "", children: "No direct action" }), sortedActions.map((action) => (_jsx("option", { value: action.id, children: action.title }, action.id)))] })] })), _jsxs("fieldset", { className: "ib-mobile-control-geometry", children: [_jsx("legend", { children: "Position and size (%)" }), _jsx(ExactNumberField, { label: "X", value: selected.x, disabled: !editable, onChange: (value) => updateControl(selected.id, { x: value }) }), _jsx(ExactNumberField, { label: "Y", value: selected.y, disabled: !editable, onChange: (value) => updateControl(selected.id, { y: value }) }), _jsx(ExactNumberField, { label: "Width", value: selected.width, min: 4, disabled: !editable, onChange: (value) => updateControl(selected.id, { width: value }) }), _jsx(ExactNumberField, { label: "Height", value: selected.height, min: 4, disabled: !editable, onChange: (value) => updateControl(selected.id, { height: value }) })] }), _jsx("p", { className: "ib-mobile-control-hint", children: "Arrow keys nudge by 1%; hold Shift for 5%. Touch and pointer dragging use the same controlled layout values." })] })) : (_jsxs("div", { className: "ib-mobile-control-empty", children: [_jsx("strong", { children: "No control selected" }), _jsx("span", { children: "Add or select a control to edit its exact placement." })] })), !editable && (_jsx("p", { className: "ib-mobile-control-hint", children: "This overlay is read-only until the consumer provides onMobileOverlayChange." }))] })] }))] }));
}
function ExactNumberField({ label, value, onChange, disabled, min = 0, }) {
    return (_jsxs("label", { children: [_jsx("span", { children: label }), _jsx("input", { type: "number", min: min, max: 100, step: 1, value: roundPercent(value), disabled: disabled, onChange: (event) => {
                    const parsed = Number(event.target.value);
                    if (Number.isFinite(parsed)) {
                        onChange(parsed);
                    }
                } })] }));
}
function nextControlId(kind, controls) {
    const stems = {
        gestureZone: "gesture-zone",
        button: "action-button",
        stick: "stick",
        dock: "dock",
    };
    const stem = stems[kind];
    let suffix = 1;
    const ids = new Set(controls.map((control) => control.id));
    while (ids.has(`${stem}-${suffix}`)) {
        suffix += 1;
    }
    return `${stem}-${suffix}`;
}
function constrainControl(control) {
    const width = clamp(control.width, 4, 100);
    const height = clamp(control.height, 4, 100);
    return {
        ...control,
        x: roundPercent(clamp(control.x, 0, 100 - width)),
        y: roundPercent(clamp(control.y, 0, 100 - height)),
        width: roundPercent(width),
        height: roundPercent(height),
    };
}
function roundPercent(value) {
    return Math.round(value * 10) / 10;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
}
function controlKindLabel(kind) {
    switch (kind) {
        case "stick":
            return "Thumbstick";
        case "button":
            return "Action button";
        case "gestureZone":
            return "Gesture zone";
        case "dock":
            return "Command dock";
    }
}
function controlTitle(label, actionTitle) {
    return actionTitle ? `${label} → ${actionTitle}` : label;
}
