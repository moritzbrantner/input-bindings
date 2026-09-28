import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  pointerAxisFromCenter,
  pointerAxisFromOrigin,
} from "@moritzbrantner/input-bindings-web";
import type { MobileControlsOverlay, MobileOverlayControl } from "./MobileControlsView.tsx";

export interface MobileAxis2D {
  x: number;
  y: number;
}

export interface MobileActionInputEvent {
  controlId: string;
  action: string;
  phase: "press" | "release";
}

export interface MobileAnalogInputEvent {
  controlId: string;
  action: string;
  phase: "update" | "release";
  value: MobileAxis2D;
}

export interface MobileControlsRuntimeSurfaceProps {
  overlay: MobileControlsOverlay;
  onActionInput?: (event: MobileActionInputEvent) => void;
  onAnalogInput?: (event: MobileAnalogInputEvent) => void;
  className?: string;
}

interface ActivePointer {
  pointerId: number;
  originX: number;
  originY: number;
  control: MobileOverlayControl;
}

export function MobileControlsRuntimeSurface({
  overlay,
  onActionInput,
  onAnalogInput,
  className,
}: MobileControlsRuntimeSurfaceProps) {
  const activePointers = useRef(new Map<string, ActivePointer>());
  const actionInputRef = useRef(onActionInput);
  const analogInputRef = useRef(onAnalogInput);
  actionInputRef.current = onActionInput;
  analogInputRef.current = onAnalogInput;
  const [axisByControl, setAxisByControl] = useState<Record<string, MobileAxis2D>>({});

  const emitAxis = (
    control: MobileOverlayControl,
    value: MobileAxis2D,
    phase: "update" | "release" = "update",
  ) => {
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

  const axisForEvent = (
    control: MobileOverlayControl,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): MobileAxis2D => {
    if (control.kind === "stick") {
      return pointerAxisFromCenter(event.currentTarget, event, {
        deadzone: 0.08,
        invertY: true,
      });
    }

    const pointer = activePointers.current.get(control.id);
    if (!pointer) return { x: 0, y: 0 };
    return pointerAxisFromOrigin(
      event.currentTarget,
      event,
      { x: pointer.originX, y: pointer.originY },
      {
        deadzone: 0.03,
        invertY: true,
      },
    );
  };

  const start = (
    control: MobileOverlayControl,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (activePointers.current.has(control.id)) return;
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
      emitAxis(
        activeControl,
        activeControl.kind === "stick"
          ? axisForEvent(activeControl, event)
          : { x: 0, y: 0 },
      );
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

  const move = (
    control: MobileOverlayControl,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const pointer = activePointers.current.get(control.id);
    if (!pointer || pointer.pointerId !== event.pointerId) return;
    const activeControl = pointer.control;
    if (activeControl.kind !== "stick" && activeControl.kind !== "gestureZone") return;
    event.preventDefault();
    emitAxis(activeControl, axisForEvent(activeControl, event));
  };

  const stop = (
    control: MobileOverlayControl,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const pointer = activePointers.current.get(control.id);
    if (!pointer || pointer.pointerId !== event.pointerId) return;
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
    emitRuntimeRelease(
      activeControl,
      actionInputRef.current,
      analogInputRef.current,
    );
  };

  const keyboardActivate = (
    control: MobileOverlayControl,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (event.detail !== 0 || !control.actionId) return;
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
    const currentControls = new Map(
      overlay.controls.map((control) => [control.id, control]),
    );
    for (const [controlId, pointer] of [...activePointers.current.entries()]) {
      const current = currentControls.get(controlId);
      if (current && hasSameRuntimeMapping(pointer.control, current)) continue;

      activePointers.current.delete(controlId);
      emitRuntimeRelease(
        pointer.control,
        actionInputRef.current,
        analogInputRef.current,
      );
      setAxisByControl((currentAxis) => {
        const next = { ...currentAxis };
        delete next[controlId];
        return next;
      });
    }
  }, [overlay.controls]);

  useEffect(() => {
    return () => {
      for (const pointer of activePointers.current.values()) {
        emitRuntimeRelease(
          pointer.control,
          actionInputRef.current,
          analogInputRef.current,
        );
      }
      activePointers.current.clear();
    };
  }, []);

  return (
    <div
      className={["ib-mobile-runtime", className].filter(Boolean).join(" ")}
      aria-label="Mobile controls runtime"
    >
      <div
        className="ib-mobile-overlay-frame is-runtime"
        data-orientation={overlay.orientation}
        aria-label="Interactive mobile controls"
      >
        <div className="ib-mobile-overlay-safe-area" aria-hidden="true" />
        <div className="ib-mobile-overlay-content" aria-hidden="true">
          <span>Touch input surface</span>
        </div>
        {overlay.controls.map((control) => {
          const axis = axisByControl[control.id] ?? { x: 0, y: 0 };
          const style = {
            "--ib-mobile-x": `${control.x}%`,
            "--ib-mobile-y": `${control.y}%`,
            "--ib-mobile-width": `${control.width}%`,
            "--ib-mobile-height": `${control.height}%`,
          } as CSSProperties;
          const mapped = control.analogActionId ?? control.actionId;

          return (
            <button
              key={control.id}
              type="button"
              className={[
                "ib-mobile-overlay-control",
                "is-runtime",
                `is-${control.kind}`,
                Math.hypot(axis.x, axis.y) > 0 ? "is-active" : "",
              ].filter(Boolean).join(" ")}
              style={style}
              aria-label={`${control.label} runtime control`}
              title={mapped ? `${control.label} → ${mapped}` : control.label}
              onPointerDown={(event) => start(control, event)}
              onPointerMove={(event) => move(control, event)}
              onPointerUp={(event) => stop(control, event)}
              onPointerCancel={(event) => stop(control, event)}
              onLostPointerCapture={(event) => stop(control, event)}
              onClick={(event) => keyboardActivate(control, event)}
            >
              {control.kind === "stick" && (
                <span
                  className="ib-mobile-stick-knob"
                  aria-hidden="true"
                  style={{
                    transform: `translate(${axis.x * 45}%, ${-axis.y * 45}%)`,
                  }}
                />
              )}
              <strong>{control.label}</strong>
              {(control.kind === "stick" || control.kind === "gestureZone") &&
                control.analogActionId && (
                  <small>
                    {formatAxis(axis)}
                  </small>
                )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function hasSameRuntimeMapping(
  left: MobileOverlayControl,
  right: MobileOverlayControl,
): boolean {
  return (
    left.kind === right.kind &&
    left.actionId === right.actionId &&
    left.analogActionId === right.analogActionId
  );
}

function emitRuntimeRelease(
  control: MobileOverlayControl,
  onActionInput: MobileControlsRuntimeSurfaceProps["onActionInput"],
  onAnalogInput: MobileControlsRuntimeSurfaceProps["onAnalogInput"],
): void {
  if (
    (control.kind === "stick" || control.kind === "gestureZone") &&
    control.analogActionId
  ) {
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

function formatAxis(value: MobileAxis2D): string {
  return `${value.x.toFixed(2)}, ${value.y.toFixed(2)}`;
}
