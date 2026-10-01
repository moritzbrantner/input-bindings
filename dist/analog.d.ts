import { type AnalogInputController, type Axis2D } from "@moritzbrantner/input-bindings-runtime";
export type AnalogEventTargetLike = {
    addEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
    removeEventListener(type: string, listener: (event: any) => void, options?: unknown): void;
};
export type AnalogPointerTargetLike = {
    getBoundingClientRect(): {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    setPointerCapture?(pointerId: number): void;
    releasePointerCapture?(pointerId: number): void;
} & AnalogEventTargetLike;
export type AnalogPointerEventLike = {
    pointerId: number;
    clientX: number;
    clientY: number;
    preventDefault?: (() => void) | undefined;
};
export type PointerAnalogAdapterOptions = {
    target: AnalogPointerTargetLike;
    action: string;
    sourceId?: string | undefined;
    deadzone?: number | undefined;
    sensitivity?: number | undefined;
    invertX?: boolean | undefined;
    invertY?: boolean | undefined;
    preventDefault?: boolean | undefined;
};
export type TouchLookAnalogAdapterOptions = {
    maxTravelPx?: number | undefined;
} & PointerAnalogAdapterOptions;
export type DeviceMotionRotationRateLike = {
    alpha?: number | null | undefined;
    beta?: number | null | undefined;
    gamma?: number | null | undefined;
};
export type DeviceMotionEventLike = {
    rotationRate?: DeviceMotionRotationRateLike | null | undefined;
};
export type GyroscopeAnalogAdapterOptions = {
    action: string;
    sourceId?: string | undefined;
    target?: AnalogEventTargetLike | undefined;
    maxRateDegPerSec?: number | undefined;
    deadzone?: number | undefined;
    sensitivity?: number | undefined;
    smoothing?: number | undefined;
    invertX?: boolean | undefined;
    invertY?: boolean | undefined;
    getScreenOrientationDegrees?: (() => number) | undefined;
};
export type GyroscopeSampleOptions = {
    maxRateDegPerSec?: number | undefined;
    deadzone?: number | undefined;
    sensitivity?: number | undefined;
    invertX?: boolean | undefined;
    invertY?: boolean | undefined;
    screenOrientationDegrees?: number | undefined;
};
export type MotionPermissionState = "granted" | "denied" | "unsupported";
export declare function attachVirtualStickAnalog(controller: AnalogInputController, options: PointerAnalogAdapterOptions): () => void;
export declare function attachTouchLookAnalog(controller: AnalogInputController, options: TouchLookAnalogAdapterOptions): () => void;
export declare function attachGyroscopeAnalog(controller: AnalogInputController, options: GyroscopeAnalogAdapterOptions): () => void;
export declare function gyroscopeEventToAxis2D(event: DeviceMotionEventLike, options?: GyroscopeSampleOptions): Axis2D;
export declare function requestDeviceMotionPermission(): Promise<MotionPermissionState>;
export declare function pointerAxisFromOrigin(target: Pick<AnalogPointerTargetLike, "getBoundingClientRect">, event: Pick<AnalogPointerEventLike, "clientX" | "clientY">, origin: {
    x: number;
    y: number;
}, options?: Pick<TouchLookAnalogAdapterOptions, "deadzone" | "sensitivity" | "invertX" | "invertY" | "maxTravelPx">): Axis2D;
export declare function pointerAxisFromCenter(target: Pick<AnalogPointerTargetLike, "getBoundingClientRect">, event: Pick<AnalogPointerEventLike, "clientX" | "clientY">, options?: Pick<PointerAnalogAdapterOptions, "deadzone" | "sensitivity" | "invertX" | "invertY">): Axis2D;
