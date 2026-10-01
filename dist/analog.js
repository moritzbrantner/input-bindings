import { applyAxis2DDeadzone, rotateAxis2D, scaleAxis2D, smoothAxis2D, } from "@moritzbrantner/input-bindings-runtime";
export function attachVirtualStickAnalog(controller, options) {
    const sourceId = options.sourceId ?? `virtual-stick:${options.action}`;
    let pointerId;
    const emit = (event) => {
        const value = pointerAxisFromCenter(options.target, event, options);
        controller.setAxis2D(sourceId, options.action, value);
        if (options.preventDefault ?? true) {
            event.preventDefault?.();
        }
    };
    const onPointerDown = (rawEvent) => {
        const event = rawEvent;
        if (pointerId !== undefined) {
            return;
        }
        pointerId = event.pointerId;
        options.target.setPointerCapture?.(event.pointerId);
        emit(event);
    };
    const onPointerMove = (rawEvent) => {
        const event = rawEvent;
        if (event.pointerId !== pointerId) {
            return;
        }
        emit(event);
    };
    const stop = (rawEvent, releaseCapture = true) => {
        const event = rawEvent;
        if (event.pointerId !== pointerId) {
            return;
        }
        pointerId = undefined;
        if (releaseCapture) {
            options.target.releasePointerCapture?.(event.pointerId);
        }
        controller.clearSource(sourceId, options.action);
        if (options.preventDefault ?? true) {
            event.preventDefault?.();
        }
    };
    const onLostPointerCapture = (rawEvent) => stop(rawEvent, false);
    options.target.addEventListener("pointerdown", onPointerDown);
    options.target.addEventListener("pointermove", onPointerMove);
    options.target.addEventListener("pointerup", stop);
    options.target.addEventListener("pointercancel", stop);
    options.target.addEventListener("lostpointercapture", onLostPointerCapture);
    return () => {
        options.target.removeEventListener("pointerdown", onPointerDown);
        options.target.removeEventListener("pointermove", onPointerMove);
        options.target.removeEventListener("pointerup", stop);
        options.target.removeEventListener("pointercancel", stop);
        options.target.removeEventListener("lostpointercapture", onLostPointerCapture);
        controller.clearSource(sourceId, options.action);
    };
}
export function attachTouchLookAnalog(controller, options) {
    const sourceId = options.sourceId ?? `touch-look:${options.action}`;
    let pointerId;
    let origin;
    const emit = (event) => {
        if (!origin) {
            return;
        }
        const value = pointerAxisFromOrigin(options.target, event, origin, options);
        controller.setAxis2D(sourceId, options.action, value);
        if (options.preventDefault ?? true) {
            event.preventDefault?.();
        }
    };
    const onPointerDown = (rawEvent) => {
        const event = rawEvent;
        if (pointerId !== undefined) {
            return;
        }
        pointerId = event.pointerId;
        origin = { x: event.clientX, y: event.clientY };
        options.target.setPointerCapture?.(event.pointerId);
        controller.setAxis2D(sourceId, options.action, { x: 0, y: 0 });
        if (options.preventDefault ?? true) {
            event.preventDefault?.();
        }
    };
    const onPointerMove = (rawEvent) => {
        const event = rawEvent;
        if (event.pointerId !== pointerId) {
            return;
        }
        emit(event);
    };
    const stop = (rawEvent, releaseCapture = true) => {
        const event = rawEvent;
        if (event.pointerId !== pointerId) {
            return;
        }
        pointerId = undefined;
        origin = undefined;
        if (releaseCapture) {
            options.target.releasePointerCapture?.(event.pointerId);
        }
        controller.clearSource(sourceId, options.action);
        if (options.preventDefault ?? true) {
            event.preventDefault?.();
        }
    };
    const onLostPointerCapture = (rawEvent) => stop(rawEvent, false);
    options.target.addEventListener("pointerdown", onPointerDown);
    options.target.addEventListener("pointermove", onPointerMove);
    options.target.addEventListener("pointerup", stop);
    options.target.addEventListener("pointercancel", stop);
    options.target.addEventListener("lostpointercapture", onLostPointerCapture);
    return () => {
        options.target.removeEventListener("pointerdown", onPointerDown);
        options.target.removeEventListener("pointermove", onPointerMove);
        options.target.removeEventListener("pointerup", stop);
        options.target.removeEventListener("pointercancel", stop);
        options.target.removeEventListener("lostpointercapture", onLostPointerCapture);
        controller.clearSource(sourceId, options.action);
    };
}
export function attachGyroscopeAnalog(controller, options) {
    const globals = globalThis;
    const target = options.target ?? globals.window;
    if (!target) {
        throw new Error("attachGyroscopeAnalog requires a target outside a browser environment");
    }
    const sourceId = options.sourceId ?? `gyroscope:${options.action}`;
    const response = clamp(options.smoothing ?? 0.3, 0, 1);
    let smoothed = { x: 0, y: 0 };
    const screenOrientationDegrees = options.getScreenOrientationDegrees ??
        (() => globals.screen?.orientation?.angle ?? globals.window?.orientation ?? 0);
    const onMotion = (rawEvent) => {
        const event = rawEvent;
        const sample = gyroscopeEventToAxis2D(event, {
            maxRateDegPerSec: options.maxRateDegPerSec,
            deadzone: options.deadzone,
            sensitivity: options.sensitivity,
            invertX: options.invertX,
            invertY: options.invertY,
            screenOrientationDegrees: screenOrientationDegrees(),
        });
        smoothed = smoothAxis2D(smoothed, sample, response);
        controller.setAxis2D(sourceId, options.action, smoothed);
    };
    target.addEventListener("devicemotion", onMotion);
    return () => {
        target.removeEventListener("devicemotion", onMotion);
        smoothed = { x: 0, y: 0 };
        controller.clearSource(sourceId, options.action);
    };
}
export function gyroscopeEventToAxis2D(event, options = {}) {
    const rate = event.rotationRate;
    if (!rate) {
        return { x: 0, y: 0 };
    }
    const maxRate = Math.max(1, finiteOr(options.maxRateDegPerSec, 180));
    const gamma = finiteOr(rate.gamma, 0);
    const beta = finiteOr(rate.beta, 0);
    let value = {
        x: gamma / maxRate,
        y: beta / maxRate,
    };
    if (options.invertX) {
        value.x *= -1;
    }
    if (options.invertY) {
        value.y *= -1;
    }
    value = rotateAxis2D(value, -(options.screenOrientationDegrees ?? 0));
    value = applyAxis2DDeadzone(value, options.deadzone ?? 0.03);
    return scaleAxis2D(value, options.sensitivity ?? 1);
}
export async function requestDeviceMotionPermission() {
    const globals = globalThis;
    const motionEvent = globals.DeviceMotionEvent;
    if (!motionEvent?.requestPermission) {
        return motionEvent ? "granted" : "unsupported";
    }
    try {
        return (await motionEvent.requestPermission()) === "granted" ? "granted" : "denied";
    }
    catch {
        return "denied";
    }
}
export function pointerAxisFromOrigin(target, event, origin, options = {}) {
    const rect = target.getBoundingClientRect();
    const defaultTravel = Math.max(1, Math.min(rect.width, rect.height) / 3);
    const travel = Math.max(1, options.maxTravelPx ?? defaultTravel);
    return processPointerAxis({
        x: (event.clientX - origin.x) / travel,
        y: (event.clientY - origin.y) / travel,
    }, options);
}
export function pointerAxisFromCenter(target, event, options = {}) {
    const rect = target.getBoundingClientRect();
    const halfWidth = Math.max(1, rect.width / 2);
    const halfHeight = Math.max(1, rect.height / 2);
    return processPointerAxis({
        x: (event.clientX - (rect.left + halfWidth)) / halfWidth,
        y: (event.clientY - (rect.top + halfHeight)) / halfHeight,
    }, options);
}
function processPointerAxis(value, options) {
    const directed = {
        x: options.invertX ? -value.x : value.x,
        y: options.invertY ? -value.y : value.y,
    };
    return scaleAxis2D(applyAxis2DDeadzone(directed, options.deadzone ?? 0.08), options.sensitivity ?? 1);
}
function finiteOr(value, fallback) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
