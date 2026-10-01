import type { ActionRegistry, Binding, GestureMatch } from "@moritzbrantner/input-bindings";
import { InputRuntimeController } from "@moritzbrantner/input-bindings-runtime";
import { attachGestureRuntime } from "@moritzbrantner/input-bindings-web";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";

import {
  MobileControlsRuntimeSurface,
  type MobileGestureRuntime,
} from "../src/MobileControlsRuntimeSurface.tsx";
import type { MobileControlsOverlay } from "../src/MobileControlsView.tsx";

import "../src/workbench.css";

const gesture = (id: string, action: string, match: GestureMatch, context?: string): Binding => ({
  id,
  action,
  sequence: [{ device: "gesture", gesture: match }],
  ...(context ? { when: { op: "context", id: context } } : {}),
});

const registry: ActionRegistry = {
  actions: [
    {
      id: "game.attack",
      title: "Attack",
      allowedDevices: ["pointer"],
      defaults: [gesture("attack.slash", "game.attack", { kind: "slash" })],
    },
    {
      id: "selection.lasso",
      title: "Lasso",
      allowedDevices: ["pointer"],
      defaults: [gesture("lasso.circle", "selection.lasso", { kind: "circle" })],
    },
    {
      id: "spell.ward",
      title: "Ward",
      allowedDevices: ["pointer"],
      defaults: [gesture("ward.circle", "spell.ward", { kind: "circle" }, "zone.spells")],
    },
  ],
};

const initialOverlay: MobileControlsOverlay = {
  orientation: "landscape",
  controls: [
    {
      id: "spell-zone",
      kind: "gestureZone",
      label: "Spells",
      gestureContext: "zone.spells",
      x: 40,
      y: 8,
      width: 56,
      height: 84,
    },
    {
      id: "jump",
      kind: "button",
      label: "Jump",
      actionId: "game.jump",
      x: 4,
      y: 60,
      width: 14,
      height: 28,
    },
  ],
};

function GestureZoneHarness() {
  const [controller] = useState(
    () => new InputRuntimeController({ registry, getActiveContexts: () => new Set() }),
  );
  const [overlay, setOverlay] = useState(initialOverlay);
  const [events, setEvents] = useState<string[]>([]);
  const desktopRef = useRef<HTMLDivElement | null>(null);
  const record = (entry: string) => setEvents((current) => [...current, entry]);

  useEffect(() => {
    const element = desktopRef.current;
    if (!element) {
      return undefined;
    }
    return attachGestureRuntime(controller, {
      target: element,
      sourceId: "desktop",
      onGesture: ({ decision }) =>
        record(`desktop:${decision.dispatches[0]?.action ?? decision.kind}`),
    });
  }, [controller]);

  const gestureRuntime: MobileGestureRuntime = {
    controller,
    onStroke: (event) => {
      if (event.phase === "cancel") {
        record(`zone:cancel:${event.cancelReason ?? "unknown"}`);
      }
    },
    onGesture: (event) =>
      record(`zone:${event.decision.dispatches[0]?.action ?? event.decision.kind}`),
  };

  const editZone = (patch: Partial<MobileControlsOverlay["controls"][number]>) =>
    setOverlay((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === "spell-zone" ? { ...control, ...patch } : control,
      ),
    }));

  return (
    <main>
      <div>
        <button
          type="button"
          onClick={() =>
            setOverlay((current) => ({
              ...current,
              orientation: current.orientation === "landscape" ? "portrait" : "landscape",
            }))
          }
        >
          Rotate overlay
        </button>
        <button
          type="button"
          onClick={() =>
            setOverlay((current) => ({
              ...current,
              controls: current.controls.map((control) =>
                control.id === "jump" ? { ...control, x: control.x === 4 ? 6 : 4 } : control,
              ),
            }))
          }
        >
          Move jump button
        </button>
        <button type="button" onClick={() => editZone({ gestureContext: "zone.other" })}>
          Change zone context
        </button>
      </div>
      <div
        ref={desktopRef}
        role="application"
        aria-label="Desktop gesture surface"
        style={{
          height: 180,
          margin: "12px 0",
          border: "1px dashed currentColor",
          touchAction: "none",
        }}
      />
      <MobileControlsRuntimeSurface overlay={overlay} gestureRuntime={gestureRuntime} />
      <output data-testid="gesture-events">{events.join(" | ")}</output>
    </main>
  );
}

const meta = {
  title: "Input bindings/Mobile gesture zones",
  component: MobileControlsRuntimeSurface,
  args: { overlay: initialOverlay },
} satisfies Meta<typeof MobileControlsRuntimeSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SharedGestureRuntime: Story = {
  render: () => <GestureZoneHarness />,
};
