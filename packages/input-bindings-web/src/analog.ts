import {
  applyAxis2DDeadzone,
  rotateAxis2D,
  scaleAxis2D,
  smoothAxis2D,
  type AnalogInputController,
  type Axis2D,
} from "@moritzbrantner/input-bindings-runtime";

export interface AnalogEventTargetLike {
  addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
  removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
}

export interface AnalogPointerTargetLike extends AnalogEventTargetLike {
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  setPointerCapture?(pointerId: number): void;
  releasePointerCapture?(pointerId: number): void;
}

export interface AnalogPointerEventLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
}

export interface PointerAnalogAdapterOptions {
  target: AnalogPointerTargetLike;
  action: string;
  sourceId?: string;
  deadzone?: number;
  sensitivity?: number;
  invertX?: boolean;
  invertY?: boolean;
  preventDefault?: boolean;
}

export interface TouchLookAnalogAdapterOptions extends PointerAnalogAdapterOptions {
  maxTravelPx?: number;
}

export interface DeviceMotionRotationRateLike {
  alpha?: number | null;
  beta?: number | null;
  gamma?: number | null;
}

export interface DeviceMotionEventLike {
  rotationRate?: DeviceMotionRotationRateLike | null;
}

export interface GyroscopeAnalogAdapterOptions {
  action: string;
  sourceId?: string;
  target?: AnalogEventTargetLike;
  maxRateDegPerSec?: number;
  deadzone?: number;
  sensitivity?: number;
  smoothing?: number;
  invertX?: boolean;
  invertY?: boolean;
  getScreenOrientationDegrees?: () => number;
}

export interface GyroscopeSampleOptions {
  maxRateDegPerSec?: number;
  deadzone?: number;
  sensitivity?: number;
  invertX?: boolean;
  invertY?: boolean;
  screenOrientationDegrees?: number;
}

export type MotionPermissionState = "granted" | "denied" | "unsupported";

export function attachVirtualStickAnalog(
  controller: AnalogInputController,
  options: PointerAnalogAdapterOptions,
): () => void {
  const sourceId = options.sourceId ?? `virtual-stick:${options.action}`;
  let pointerId: number | undefined;

  const emit = (event: AnalogPointerEventLike) => {
    const value = pointerAxisFromCenter(options.target, event, options);
    controller.setAxis2D(sourceId, options.action, value);
    if (options.preventDefault ?? true) event.preventDefault?.();
  };

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (pointerId !== undefined) return;
    pointerId = event.pointerId;
    options.target.setPointerCapture?.(event.pointerId);
    emit(event);
  };
  const onPointerMove = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (event.pointerId !== pointerId) return;
    emit(event);
  };
  const stop = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (event.pointerId !== pointerId) return;
    options.target.releasePointerCapture?.(event.pointerId);
    pointerId = undefined;
    controller.clearSource(sourceId, options.action);
    if (options.preventDefault ?? true) event.preventDefault?.();
  };

  options.target.addEventListener("pointerdown", onPointerDown);
  options.target.addEventListener("pointermove", onPointerMove);
  options.target.addEventListener("pointerup", stop);
  options.target.addEventListener("pointercancel", stop);

  return () => {
    options.target.removeEventListener("pointerdown", onPointerDown);
    options.target.removeEventListener("pointermove", onPointerMove);
    options.target.removeEventListener("pointerup", stop);
    options.target.removeEventListener("pointercancel", stop);
    controller.clearSource(sourceId, options.action);
  };
}

export function attachTouchLookAnalog(
  controller: AnalogInputController,
  options: TouchLookAnalogAdapterOptions,
): () => void {
  const sourceId = options.sourceId ?? `touch-look:${options.action}`;
  let pointerId: number | undefined;
  let origin: { x: number; y: number } | undefined;

  const emit = (event: AnalogPointerEventLike) => {
    if (!origin) return;
    const value = pointerAxisFromOrigin(
      options.target,
      event,
      origin,
      options,
    );
    controller.setAxis2D(sourceId, options.action, value);
    if (options.preventDefault ?? true) event.preventDefault?.();
  };

  const onPointerDown = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (pointerId !== undefined) return;
    pointerId = event.pointerId;
    origin = { x: event.clientX, y: event.clientY };
    options.target.setPointerCapture?.(event.pointerId);
    controller.setAxis2D(sourceId, options.action, { x: 0, y: 0 });
    if (options.preventDefault ?? true) event.preventDefault?.();
  };
  const onPointerMove = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (event.pointerId !== pointerId) return;
    emit(event);
  };
  const stop = (rawEvent: any) => {
    const event = rawEvent as AnalogPointerEventLike;
    if (event.pointerId !== pointerId) return;
    options.target.releasePointerCapture?.(event.pointerId);
    pointerId = undefined;
    origin = undefined;
    controller.clearSource(sourceId, options.action);
    if (options.preventDefault ?? true) event.preventDefault?.();
  };

  options.target.addEventListener("pointerdown", onPointerDown);
  options.target.addEventListener("pointermove", onPointerMove);
  options.target.addEventListener("pointerup", stop);
  options.target.addEventListener("pointercancel", stop);

  return () => {
    options.target.removeEventListener("pointerdown", onPointerDown);
    options.target.removeEventListener("pointermove", onPointerMove);
    options.target.removeEventListener("pointerup", stop);
    options.target.removeEventListener("pointercancel", stop);
    controller.clearSource(sourceId, options.action);
  };
}

export function attachGyroscopeAnalog(
  controller: AnalogInputController,
  options: GyroscopeAnalogAdapterOptions,
): () => void {
  const globals = globalThis as unknown as {
    window?: AnalogEventTargetLike & { orientation?: number };
    screen?: { orientation?: { angle?: number } };
  };
  const target = options.target ?? globals.window;
  if (!target) {
    throw new Error("attachGyroscopeAnalog requires a target outside a browser environment");
  }

  const sourceId = options.sourceId ?? `gyroscope:${options.action}`;
  const response = clamp(options.smoothing ?? 0.3, 0, 1);
  let smoothed: Axis2D = { x: 0, y: 0 };

  const screenOrientationDegrees =
    options.getScreenOrientationDegrees ??
    (() => globals.screen?.orientation?.angle ?? globals.window?.orientation ?? 0);

  const onMotion = (rawEvent: any) => {
    const event = rawEvent as DeviceMotionEventLike;
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

export function gyroscopeEventToAxis2D(
  event: DeviceMotionEventLike,
  options: GyroscopeSampleOptions = {},
): Axis2D {
  const rate = event.rotationRate;
  if (!rate) return { x: 0, y: 0 };

  const maxRate = Math.max(1, finiteOr(options.maxRateDegPerSec, 180));
  const gamma = finiteOr(rate.gamma, 0);
  const beta = finiteOr(rate.beta, 0);
  let value: Axis2D = {
    x: gamma / maxRate,
    y: beta / maxRate,
  };

  if (options.invertX) value.x *= -1;
  if (options.invertY) value.y *= -1;
  value = rotateAxis2D(value, -(options.screenOrientationDegrees ?? 0));
  value = applyAxis2DDeadzone(value, options.deadzone ?? 0.03);
  return scaleAxis2D(value, options.sensitivity ?? 1);
}

export async function requestDeviceMotionPermission(): Promise<MotionPermissionState> {
  const globals = globalThis as unknown as {
    DeviceMotionEvent?: {
      requestPermission?: () => Promise<"granted" | "denied">;
    };
  };
  const motionEvent = globals.DeviceMotionEvent;
  if (!motionEvent?.requestPermission) {
    return motionEvent ? "granted" : "unsupported";
  }

  try {
    return (await motionEvent.requestPermission()) === "granted" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

export function pointerAxisFromOrigin(
  target: Pick<AnalogPointerTargetLike, "getBoundingClientRect">,
  event: Pick<AnalogPointerEventLike, "clientX" | "clientY">,
  origin: { x: number; y: number },
  options: Pick<
    TouchLookAnalogAdapterOptions,
    "deadzone" | "sensitivity" | "invertX" | "invertY" | "maxTravelPx"
  > = {},
): Axis2D {
  const rect = target.getBoundingClientRect();
  const defaultTravel = Math.max(1, Math.min(rect.width, rect.height) / 3);
  const travel = Math.max(1, options.maxTravelPx ?? defaultTravel);
  return processPointerAxis(
    {
      x: (event.clientX - origin.x) / travel,
      y: (event.clientY - origin.y) / travel,
    },
    options,
  );
}

export function pointerAxisFromCenter(
  target: Pick<AnalogPointerTargetLike, "getBoundingClientRect">,
  event: Pick<AnalogPointerEventLike, "clientX" | "clientY">,
  options: Pick<
    PointerAnalogAdapterOptions,
    "deadzone" | "sensitivity" | "invertX" | "invertY"
  > = {},
): Axis2D {
  const rect = target.getBoundingClientRect();
  const halfWidth = Math.max(1, rect.width / 2);
  const halfHeight = Math.max(1, rect.height / 2);
  return processPointerAxis(
    {
      x: (event.clientX - (rect.left + halfWidth)) / halfWidth,
      y: (event.clientY - (rect.top + halfHeight)) / halfHeight,
    },
    options,
  );
}

function processPointerAxis(
  value: Axis2D,
  options: Pick<
    PointerAnalogAdapterOptions,
    "deadzone" | "sensitivity" | "invertX" | "invertY"
  >,
): Axis2D {
  const directed = {
    x: options.invertX ? -value.x : value.x,
    y: options.invertY ? -value.y : value.y,
  };
  return scaleAxis2D(
    applyAxis2DDeadzone(directed, options.deadzone ?? 0.08),
    options.sensitivity ?? 1,
  );
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
