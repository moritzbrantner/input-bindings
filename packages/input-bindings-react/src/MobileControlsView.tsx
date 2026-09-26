import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import type { ActionRegistry } from "@moritzbrantner/input-bindings";
import {
  MobileControlsRuntimeSurface,
  type MobileActionInputEvent,
  type MobileAnalogInputEvent,
} from "./MobileControlsRuntimeSurface.tsx";

export type MobileControlKind = "stick" | "button" | "gestureZone" | "dock";
export type MobileControlsOrientation = "portrait" | "landscape";

export interface MobileOverlayControl {
  id: string;
  kind: MobileControlKind;
  label: string;
  actionId?: string;
  analogActionId?: string;
  /** Left edge as a percentage of the preview surface. */
  x: number;
  /** Top edge as a percentage of the preview surface. */
  y: number;
  /** Width as a percentage of the preview surface. */
  width: number;
  /** Height as a percentage of the preview surface. */
  height: number;
}

export interface MobileControlsOverlay {
  orientation: MobileControlsOrientation;
  controls: readonly MobileOverlayControl[];
}

export interface MobileAnalogActionOption {
  id: string;
  title: string;
}

export interface MobileControlsViewProps {
  registry: ActionRegistry;
  overlay: MobileControlsOverlay;
  analogActions?: readonly MobileAnalogActionOption[];
  onOverlayChange?: (overlay: MobileControlsOverlay) => void;
  onActionInput?: (event: MobileActionInputEvent) => void;
  onAnalogInput?: (event: MobileAnalogInputEvent) => void;
}

const CONTROL_DEFAULTS: Record<
  MobileControlKind,
  Omit<MobileOverlayControl, "id">
> = {
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

export function createStarterMobileControlsOverlay(): MobileControlsOverlay {
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

export function MobileControlsView({
  registry,
  overlay,
  analogActions = [],
  onOverlayChange,
  onActionInput,
  onAnalogInput,
}: MobileControlsViewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => overlay.controls[0]?.id,
  );
  const [testing, setTesting] = useState(false);
  const selected = overlay.controls.find((control) => control.id === selectedId);
  const actionById = useMemo(
    () => new Map(registry.actions.map((action) => [action.id, action])),
    [registry],
  );
  const sortedActions = useMemo(
    () => [...registry.actions].sort((left, right) => left.title.localeCompare(right.title)),
    [registry],
  );
  const sortedAnalogActions = useMemo(
    () => [...analogActions].sort((left, right) => left.title.localeCompare(right.title)),
    [analogActions],
  );
  const editable = Boolean(onOverlayChange);

  useEffect(() => {
    if (selectedId && !overlay.controls.some((control) => control.id === selectedId)) {
      setSelectedId(overlay.controls[0]?.id);
    }
  }, [overlay.controls, selectedId]);

  const updateControl = (
    id: string,
    patch: Partial<Omit<MobileOverlayControl, "id" | "kind">>,
  ) => {
    if (!onOverlayChange) return;
    onOverlayChange({
      ...overlay,
      controls: overlay.controls.map((control) =>
        control.id === id ? constrainControl({ ...control, ...patch }) : control,
      ),
    });
  };

  const setOrientation = (orientation: MobileControlsOrientation) => {
    if (!onOverlayChange || overlay.orientation === orientation) return;
    onOverlayChange({ ...overlay, orientation });
  };

  const addControl = (kind: MobileControlKind) => {
    if (!onOverlayChange) return;
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
    if (!onOverlayChange || !selected) return;
    const nextControls = overlay.controls.filter((control) => control.id !== selected.id);
    onOverlayChange({ ...overlay, controls: nextControls });
    setSelectedId(nextControls[0]?.id);
  };

  const startDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    control: MobileOverlayControl,
  ) => {
    setSelectedId(control.id);
    if (!editable) return;
    const controlRect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: control.id,
      pointerId: event.pointerId,
      offsetX: event.clientX - controlRect.left,
      offsetY: event.clientY - controlRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    const control = drag
      ? overlay.controls.find((candidate) => candidate.id === drag.id)
      : undefined;
    if (!drag || !frame || !control || drag.pointerId !== event.pointerId) return;

    const frameRect = frame.getBoundingClientRect();
    const x = ((event.clientX - frameRect.left - drag.offsetX) / frameRect.width) * 100;
    const y = ((event.clientY - frameRect.top - drag.offsetY) / frameRect.height) * 100;
    updateControl(control.id, { x, y });
  };

  const stopDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const nudgeControl = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    control: MobileOverlayControl,
  ) => {
    if (!editable) return;
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

  return (
    <section className="ib-mobile-controls" aria-labelledby="ib-mobile-controls-heading">
      <div className="ib-mobile-controls-heading">
        <div>
          <p className="ib-workbench-eyebrow">Mobile overlay</p>
          <h2 id="ib-mobile-controls-heading">Mobile controls</h2>
          <p>Arrange touch controls over the application surface. Drag for coarse placement, then use exact percentage fields for precise positioning.</p>
        </div>
        <div className="ib-mobile-controls-modes">
          {(onActionInput || onAnalogInput) && (
            <fieldset className="ib-mode-switch">
              <legend>Mode</legend>
              <button
                type="button"
                aria-pressed={!testing}
                className={!testing ? "is-active" : undefined}
                onClick={() => setTesting(false)}
              >
                Edit
              </button>
              <button
                type="button"
                aria-pressed={testing}
                className={testing ? "is-active" : undefined}
                onClick={() => setTesting(true)}
              >
                Test
              </button>
            </fieldset>
          )}
          <fieldset className="ib-mode-switch">
            <legend>Preview orientation</legend>
            <button
              type="button"
              aria-pressed={overlay.orientation === "portrait"}
              className={overlay.orientation === "portrait" ? "is-active" : undefined}
              disabled={!editable}
              onClick={() => setOrientation("portrait")}
            >
              Portrait
            </button>
            <button
              type="button"
              aria-pressed={overlay.orientation === "landscape"}
              className={overlay.orientation === "landscape" ? "is-active" : undefined}
              disabled={!editable}
              onClick={() => setOrientation("landscape")}
            >
              Landscape
            </button>
          </fieldset>
        </div>
      </div>

      {testing ? (
        <MobileControlsRuntimeSurface
          overlay={overlay}
          onActionInput={onActionInput}
          onAnalogInput={onAnalogInput}
        />
      ) : (
      <div className="ib-mobile-overlay-layout">
        <div className="ib-mobile-overlay-workspace">
          <div
            ref={frameRef}
            className="ib-mobile-overlay-frame"
            data-orientation={overlay.orientation}
            aria-label="Mobile control overlay preview"
          >
            <div className="ib-mobile-overlay-safe-area" aria-hidden="true" />
            <div className="ib-mobile-overlay-content" aria-hidden="true">
              <span>Application surface</span>
            </div>
            {overlay.controls.map((control) => {
              const action = control.actionId ? actionById.get(control.actionId) : undefined;
              const analogAction = control.analogActionId
                ? sortedAnalogActions.find((candidate) => candidate.id === control.analogActionId)
                : undefined;
              const style = {
                "--ib-mobile-x": `${control.x}%`,
                "--ib-mobile-y": `${control.y}%`,
                "--ib-mobile-width": `${control.width}%`,
                "--ib-mobile-height": `${control.height}%`,
              } as CSSProperties;
              return (
                <button
                  key={control.id}
                  type="button"
                  className={[
                    "ib-mobile-overlay-control",
                    `is-${control.kind}`,
                    selectedId === control.id ? "is-selected" : "",
                  ].filter(Boolean).join(" ")}
                  style={style}
                  aria-pressed={selectedId === control.id}
                  aria-label={`${control.label} mobile control`}
                  title={
                    analogAction
                      ? `${control.label} → ${analogAction.title}`
                      : action
                        ? `${control.label} → ${action.title}`
                        : control.label
                  }
                  onClick={() => setSelectedId(control.id)}
                  onPointerDown={(event) => startDrag(event, control)}
                  onPointerMove={moveDrag}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onKeyDown={(event) => nudgeControl(event, control)}
                >
                  {control.kind === "stick" && <span className="ib-mobile-stick-knob" aria-hidden="true" />}
                  <strong>{control.label}</strong>
                  {control.kind === "gestureZone" && <small>drag / swipe</small>}
                  {analogAction && <small>{analogAction.title}</small>}
                  {!analogAction && action && <small>{action.title}</small>}
                </button>
              );
            })}
          </div>

          <div className="ib-mobile-control-palette" aria-label="Mobile control palette">
            <button type="button" disabled={!editable} onClick={() => addControl("stick")}>Add stick</button>
            <button type="button" disabled={!editable} onClick={() => addControl("button")}>Add action button</button>
            <button type="button" disabled={!editable} onClick={() => addControl("gestureZone")}>Add gesture zone</button>
            <button type="button" disabled={!editable} onClick={() => addControl("dock")}>Add command dock</button>
          </div>
        </div>

        <aside className="ib-mobile-control-inspector" aria-label="Selected mobile control">
          {selected ? (
            <>
              <div className="ib-mobile-control-inspector-heading">
                <div>
                  <span>{controlKindLabel(selected.kind)}</span>
                  <strong>{selected.label}</strong>
                </div>
                <button type="button" disabled={!editable} onClick={removeSelected}>Remove</button>
              </div>

              <label>
                <span>Label</span>
                <input
                  value={selected.label}
                  disabled={!editable}
                  onChange={(event) => updateControl(selected.id, { label: event.target.value })}
                />
              </label>

              {selected.kind === "stick" || selected.kind === "gestureZone" ? (
                <label>
                  <span>Analog action</span>
                  {sortedAnalogActions.length > 0 ? (
                    <select
                      value={selected.analogActionId ?? ""}
                      disabled={!editable}
                      onChange={(event) =>
                        updateControl(selected.id, {
                          analogActionId: event.target.value || undefined,
                        })
                      }
                    >
                      <option value="">No analog action</option>
                      {sortedAnalogActions.map((action) => (
                        <option key={action.id} value={action.id}>{action.title}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={selected.analogActionId ?? ""}
                      disabled={!editable}
                      placeholder="game.move"
                      onChange={(event) =>
                        updateControl(selected.id, {
                          analogActionId: event.target.value || undefined,
                        })
                      }
                    />
                  )}
                </label>
              ) : (
                <label>
                  <span>Semantic action</span>
                  <select
                    value={selected.actionId ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      updateControl(selected.id, {
                        actionId: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">No direct action</option>
                    {sortedActions.map((action) => (
                      <option key={action.id} value={action.id}>{action.title}</option>
                    ))}
                  </select>
                </label>
              )}

              <fieldset className="ib-mobile-control-geometry">
                <legend>Position and size (%)</legend>
                <ExactNumberField
                  label="X"
                  value={selected.x}
                  disabled={!editable}
                  onChange={(value) => updateControl(selected.id, { x: value })}
                />
                <ExactNumberField
                  label="Y"
                  value={selected.y}
                  disabled={!editable}
                  onChange={(value) => updateControl(selected.id, { y: value })}
                />
                <ExactNumberField
                  label="Width"
                  value={selected.width}
                  min={4}
                  disabled={!editable}
                  onChange={(value) => updateControl(selected.id, { width: value })}
                />
                <ExactNumberField
                  label="Height"
                  value={selected.height}
                  min={4}
                  disabled={!editable}
                  onChange={(value) => updateControl(selected.id, { height: value })}
                />
              </fieldset>

              <p className="ib-mobile-control-hint">
                Arrow keys nudge by 1%; hold Shift for 5%. Touch and pointer dragging use the same controlled layout values.
              </p>
            </>
          ) : (
            <div className="ib-mobile-control-empty">
              <strong>No control selected</strong>
              <span>Add or select a control to edit its exact placement.</span>
            </div>
          )}

          {!editable && (
            <p className="ib-mobile-control-hint">
              This overlay is read-only until the consumer provides onMobileOverlayChange.
            </p>
          )}
        </aside>
      </div>
      )}
    </section>
  );
}

function ExactNumberField({
  label,
  value,
  onChange,
  disabled,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
  min?: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={100}
        step={1}
        value={roundPercent(value)}
        disabled={disabled}
        onChange={(event) => {
          const parsed = Number(event.target.value);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
    </label>
  );
}

function nextControlId(
  kind: MobileControlKind,
  controls: readonly MobileOverlayControl[],
): string {
  const stem =
    kind === "gestureZone"
      ? "gesture-zone"
      : kind === "button"
        ? "action-button"
        : kind;
  let suffix = 1;
  const ids = new Set(controls.map((control) => control.id));
  while (ids.has(`${stem}-${suffix}`)) suffix += 1;
  return `${stem}-${suffix}`;
}

function constrainControl(control: MobileOverlayControl): MobileOverlayControl {
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

function roundPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function controlKindLabel(kind: MobileControlKind): string {
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
