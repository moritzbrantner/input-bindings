import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { attachGestureRuntime, pointerAxisFromCenter, pointerAxisFromOrigin, strokeGestureRecognizer, } from "@moritzbrantner/input-bindings-web";
import { useEffect, useRef, useState, } from "react";
export function MobileControlsRuntimeSurface({ overlay, onActionInput, onAnalogInput, gestureRuntime, className, }) {
    const activePointers = useRef(new Map());
    const actionInputRef = useRef(onActionInput);
    const analogInputRef = useRef(onAnalogInput);
    const gestureRuntimeRef = useRef(gestureRuntime);
    actionInputRef.current = onActionInput;
    analogInputRef.current = onAnalogInput;
    gestureRuntimeRef.current = gestureRuntime;
    const controlElements = useRef(new Map());
    const gestureZones = useRef(new Map());
    const gestureController = gestureRuntime?.controller;
    const [axisByControl, setAxisByControl] = useState({});
    const emitAxis = (control, value, phase = "update") => {
        setAxisByControl((current) => ({ ...current, [control.id]: value }));
        if (control.analogActionId) {
            analogInputRef.current?.({
                controlId: control.id,
                action: control.analogActionId,
                phase,
                value,
            });
        }
    };
    const axisForEvent = (control, event) => {
        if (control.kind === "stick") {
            return pointerAxisFromCenter(event.currentTarget, event, {
                deadzone: 0.08,
                invertY: true,
            });
        }
        const pointer = activePointers.current.get(control.id);
        if (!pointer) {
            return { x: 0, y: 0 };
        }
        return pointerAxisFromOrigin(event.currentTarget, event, { x: pointer.originX, y: pointer.originY }, {
            deadzone: 0.03,
            invertY: true,
        });
    };
    const start = (control, event) => {
        if (isGestureZone(control) || activePointers.current.has(control.id)) {
            return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const activeControl = { ...control };
        activePointers.current.set(control.id, {
            pointerId: event.pointerId,
            originX: event.clientX,
            originY: event.clientY,
            control: activeControl,
        });
        if (activeControl.kind === "stick" || activeControl.kind === "gestureZone") {
            emitAxis(activeControl, activeControl.kind === "stick" ? axisForEvent(activeControl, event) : { x: 0, y: 0 });
            return;
        }
        if (activeControl.actionId) {
            actionInputRef.current?.({
                controlId: activeControl.id,
                action: activeControl.actionId,
                phase: "press",
            });
        }
    };
    const move = (control, event) => {
        const pointer = activePointers.current.get(control.id);
        if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
        }
        const activeControl = pointer.control;
        if (activeControl.kind !== "stick" && activeControl.kind !== "gestureZone") {
            return;
        }
        event.preventDefault();
        emitAxis(activeControl, axisForEvent(activeControl, event));
    };
    const stop = (control, event) => {
        const pointer = activePointers.current.get(control.id);
        if (!pointer || pointer.pointerId !== event.pointerId) {
            return;
        }
        event.preventDefault();
        if (event.type !== "lostpointercapture") {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        activePointers.current.delete(control.id);
        const activeControl = pointer.control;
        if (activeControl.kind === "stick" || activeControl.kind === "gestureZone") {
            setAxisByControl((current) => ({
                ...current,
                [activeControl.id]: { x: 0, y: 0 },
            }));
        }
        emitRuntimeRelease(activeControl, actionInputRef.current, analogInputRef.current);
    };
    const keyboardActivate = (control, event) => {
        if (event.detail !== 0 || !control.actionId) {
            return;
        }
        onActionInput?.({
            controlId: control.id,
            action: control.actionId,
            phase: "press",
        });
        onActionInput?.({
            controlId: control.id,
            action: control.actionId,
            phase: "release",
        });
    };
    useEffect(() => {
        const currentControls = new Map(overlay.controls.map((control) => [control.id, control]));
        for (const [controlId, pointer] of [...activePointers.current.entries()]) {
            const current = currentControls.get(controlId);
            if (current && hasSameRuntimeMapping(pointer.control, current)) {
                continue;
            }
            activePointers.current.delete(controlId);
            emitRuntimeRelease(pointer.control, actionInputRef.current, analogInputRef.current);
            setAxisByControl((currentAxis) => {
                const next = { ...currentAxis };
                delete next[controlId];
                return next;
            });
        }
    }, [overlay.controls]);
    // Gesture zones attach the shared stroke runtime to their element. A zone is re-attached only
    // when its element, context, or controller changes, so unrelated overlay edits and orientation
    // changes keep an active stroke alive.
    useEffect(() => {
        const zones = gestureZones.current;
        const desired = new Map();
        for (const control of overlay.controls) {
            const element = controlElements.current.get(control.id);
            const context = control.gestureContext?.trim();
            if (gestureController && element && isGestureZone(control) && context) {
                desired.set(control.id, { key: context, element, context });
            }
        }
        for (const [controlId, zone] of [...zones.entries()]) {
            const next = desired.get(controlId);
            if (!next || next.key !== zone.key || next.element !== zone.element) {
                zone.detach();
                zones.delete(controlId);
            }
        }
        if (!gestureController) {
            return;
        }
        for (const [controlId, next] of desired) {
            if (zones.has(controlId)) {
                continue;
            }
            zones.set(controlId, {
                key: next.key,
                element: next.element,
                detach: attachGestureRuntime(gestureController, {
                    target: next.element,
                    sourceId: `mobile-zone:${controlId}`,
                    recognize: (stroke) => ({
                        ...strokeGestureRecognizer(gestureRuntimeRef.current?.recognition)(stroke),
                        contexts: [next.context],
                    }),
                    onStroke: (event) => {
                        if (event.phase === "update") {
                            return;
                        }
                        gestureRuntimeRef.current?.onStroke?.({
                            controlId,
                            phase: event.phase,
                            ...(event.stroke.cancelReason ? { cancelReason: event.stroke.cancelReason } : {}),
                        });
                    },
                    onGesture: ({ input, decision }) => gestureRuntimeRef.current?.onGesture?.({
                        controlId,
                        context: next.context,
                        matches: input.matches,
                        decision,
                    }),
                }),
            });
        }
    }, [overlay.controls, gestureController]);
    useEffect(() => {
        const zones = gestureZones.current;
        return () => {
            for (const zone of zones.values()) {
                zone.detach();
            }
            zones.clear();
        };
    }, []);
    useEffect(() => {
        return () => {
            for (const pointer of activePointers.current.values()) {
                emitRuntimeRelease(pointer.control, actionInputRef.current, analogInputRef.current);
            }
            activePointers.current.clear();
        };
    }, []);
    return (_jsx("div", { className: ["ib-mobile-runtime", className].filter(Boolean).join(" "), "aria-label": "Mobile controls runtime", children: _jsxs("div", { className: "ib-mobile-overlay-frame is-runtime", "data-orientation": overlay.orientation, "aria-label": "Interactive mobile controls", children: [_jsx("div", { className: "ib-mobile-overlay-safe-area", "aria-hidden": "true" }), _jsx("div", { className: "ib-mobile-overlay-content", "aria-hidden": "true", children: _jsx("span", { children: "Touch input surface" }) }), overlay.controls.map((control) => {
                    const axis = axisByControl[control.id] ?? { x: 0, y: 0 };
                    const style = {
                        "--ib-mobile-x": `${control.x}%`,
                        "--ib-mobile-y": `${control.y}%`,
                        "--ib-mobile-width": `${control.width}%`,
                        "--ib-mobile-height": `${control.height}%`,
                    };
                    const mapped = control.analogActionId ?? control.actionId;
                    return (_jsxs("button", { ref: (element) => {
                            if (element) {
                                controlElements.current.set(control.id, element);
                            }
                            else {
                                controlElements.current.delete(control.id);
                            }
                        }, type: "button", className: [
                            "ib-mobile-overlay-control",
                            "is-runtime",
                            `is-${control.kind}`,
                            Math.hypot(axis.x, axis.y) > 0 ? "is-active" : "",
                        ]
                            .filter(Boolean)
                            .join(" "), style: style, "aria-label": `${control.label} runtime control`, title: mapped ? `${control.label} → ${mapped}` : control.label, onPointerDown: (event) => start(control, event), onPointerMove: (event) => move(control, event), onPointerUp: (event) => stop(control, event), onPointerCancel: (event) => stop(control, event), onLostPointerCapture: (event) => stop(control, event), onClick: (event) => keyboardActivate(control, event), children: [control.kind === "stick" && (_jsx("span", { className: "ib-mobile-stick-knob", "aria-hidden": "true", style: {
                                    transform: `translate(${axis.x * 45}%, ${-axis.y * 45}%)`,
                                } })), _jsx("strong", { children: control.label }), (control.kind === "stick" || control.kind === "gestureZone") &&
                                control.analogActionId && _jsx("small", { children: formatAxis(axis) })] }, control.id));
                })] }) }));
}
function isGestureZone(control) {
    return control.kind === "gestureZone" && control.gestureContext !== undefined;
}
function hasSameRuntimeMapping(left, right) {
    return (left.kind === right.kind &&
        left.actionId === right.actionId &&
        left.analogActionId === right.analogActionId &&
        left.gestureContext === right.gestureContext);
}
function emitRuntimeRelease(control, onActionInput, onAnalogInput) {
    if ((control.kind === "stick" || control.kind === "gestureZone") && control.analogActionId) {
        onAnalogInput?.({
            controlId: control.id,
            action: control.analogActionId,
            phase: "release",
            value: { x: 0, y: 0 },
        });
        return;
    }
    if (control.actionId) {
        onActionInput?.({
            controlId: control.id,
            action: control.actionId,
            phase: "release",
        });
    }
}
function formatAxis(value) {
    return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}`;
}
