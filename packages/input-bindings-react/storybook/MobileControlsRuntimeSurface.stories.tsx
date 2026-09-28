import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  MobileControlsRuntimeSurface,
  type MobileActionInputEvent,
  type MobileAnalogInputEvent,
} from "../src/MobileControlsRuntimeSurface.tsx";
import type {
  MobileControlsOverlay,
  MobileOverlayControl,
} from "../src/MobileControlsView.tsx";
import "../src/workbench.css";

const initialControl: MobileOverlayControl = {
  id: "changing-control",
  kind: "button",
  label: "Changing",
  actionId: "game.jump",
  x: 36,
  y: 28,
  width: 28,
  height: 40,
};

const initialOverlay: MobileControlsOverlay = {
  orientation: "landscape",
  controls: [initialControl],
};

function RuntimeMappingHarness() {
  const [overlay, setOverlay] = useState<MobileControlsOverlay>(() => ({
    ...initialOverlay,
    controls: initialOverlay.controls.map((control) => ({ ...control })),
  }));
  const [events, setEvents] = useState<string[]>([]);

  const updateControl = (patch: Partial<MobileOverlayControl>) => {
    setOverlay((current) => ({
      ...current,
      controls: current.controls.map((control) =>
        control.id === initialControl.id ? { ...control, ...patch } : control,
      ),
    }));
  };

  const recordAction = (event: MobileActionInputEvent) => {
    setEvents((current) => [
      ...current,
      `action:${event.action}:${event.phase}`,
    ]);
  };
  const recordAnalog = (event: MobileAnalogInputEvent) => {
    setEvents((current) => [
      ...current,
      `analog:${event.action}:${event.phase}`,
    ]);
  };

  return (
    <main>
      <div>
        <button
          type="button"
          onClick={() => updateControl({ actionId: "menu.close" })}
        >
          Change action mapping
        </button>
        <button
          type="button"
          onClick={() =>
            updateControl({
              kind: "stick",
              actionId: undefined,
              analogActionId: "game.move",
            })
          }
        >
          Use analog mapping
        </button>
        <button
          type="button"
          onClick={() => updateControl({ analogActionId: "game.look" })}
        >
          Change analog mapping
        </button>
      </div>

      <MobileControlsRuntimeSurface
        overlay={overlay}
        onActionInput={recordAction}
        onAnalogInput={recordAnalog}
      />

      <output data-testid="runtime-events">{events.join(" | ")}</output>
    </main>
  );
}

const meta = {
  title: "Input bindings/Mobile runtime",
  component: MobileControlsRuntimeSurface,
  args: {
    overlay: initialOverlay,
  },
} satisfies Meta<typeof MobileControlsRuntimeSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MappingChanges: Story = {
  render: () => <RuntimeMappingHarness />,
};
