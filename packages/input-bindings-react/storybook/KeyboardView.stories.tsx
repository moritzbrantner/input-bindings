import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Binding, Conflict } from "@moritzbrantner/input-bindings";

import { KeyboardView, type KeyboardViewProps } from "../src/index.tsx";
import {
  KEYBOARD_LAYOUT_FIXTURES,
  keyboardLayoutFixture,
  type KeyboardLayoutFixture,
} from "./keyboard-layouts.ts";
import "./KeyboardView.stories.css";

const bindings: Binding[] = [
  {
    id: "undo.logical",
    action: "edit.undo",
    sequence: [
      {
        key: { kind: "logical", value: "z" },
        modifiers: { ctrl: true },
      },
    ],
  },
  {
    id: "physical.z",
    action: "game.physicalZ",
    sequence: [{ key: { kind: "physical", value: "KeyZ" } }],
  },
  {
    id: "move.forward",
    action: "game.moveForward",
    sequence: [{ key: { kind: "physical", value: "KeyW" } }],
  },
  {
    id: "save.primary",
    action: "file.save",
    sequence: [
      {
        key: { kind: "logical", value: "s" },
        modifiers: { ctrl: true },
      },
    ],
  },
  {
    id: "save.secondary",
    action: "file.saveAs",
    sequence: [
      {
        key: { kind: "logical", value: "s" },
        modifiers: { ctrl: true },
      },
    ],
  },
  {
    id: "help",
    action: "global.help",
    sequence: [{ key: { kind: "physical", value: "F1" } }],
  },
];

const conflicts: Conflict[] = [
  {
    leftBindingId: "save.primary",
    rightBindingId: "save.secondary",
    kind: "ambiguousExact",
  },
];

function KeyboardStory(args: KeyboardViewProps) {
  const [inspection, setInspection] = useState("No key inspected");

  return (
    <main className="ib-editor ib-story-keyboard">
      <h1>Keyboard view</h1>
      <p>
        Physical positions stay tied to KeyboardEvent.code while layout labels change what is shown
        and where logical bindings are displayed.
      </p>
      <KeyboardView
        {...args}
        onKeyInspect={(code, bindingIds) =>
          setInspection(`${code} · ${bindingIds.join(", ") || "unused"}`)
        }
      />
      <output data-testid="inspection" style={{ display: "block", marginTop: "1rem" }}>
        {inspection}
      </output>
    </main>
  );
}

function LayoutComparisonStory() {
  return (
    <main className="ib-editor ib-story-keyboard">
      <h1>Keyboard layout comparison</h1>
      <div className="ib-layout-gallery">
        {KEYBOARD_LAYOUT_FIXTURES.map((fixture) => (
          <section
            className="ib-layout-card"
            data-layout={fixture.id}
            key={fixture.id}
            aria-labelledby={`layout-${fixture.id}`}
          >
            <h2 id={`layout-${fixture.id}`}>{fixture.label}</h2>
            <p>{fixture.description}</p>
            <KeyboardView bindings={bindings} layoutLabels={fixture.layoutLabels} />
          </section>
        ))}
      </div>
    </main>
  );
}

function argsForLayout(id: KeyboardLayoutFixture["id"]): Partial<KeyboardViewProps> {
  return {
    layoutLabels: keyboardLayoutFixture(id).layoutLabels,
  };
}

const meta = {
  title: "Input bindings/Keyboard view",
  component: KeyboardView,
  render: (args) => <KeyboardStory {...args} />,
  args: {
    bindings,
  },
  argTypes: {
    layoutLabels: { control: false },
    pressedCodes: { control: false },
    highlightedSequence: { control: false },
    onKeyInspect: { control: false },
  },
} satisfies Meta<typeof KeyboardView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Qwerty: Story = {
  args: argsForLayout("qwerty"),
};

export const Qwertz: Story = {
  args: argsForLayout("qwertz"),
};

export const Azerty: Story = {
  args: argsForLayout("azerty"),
};

export const Dvorak: Story = {
  args: argsForLayout("dvorak"),
};

export const Colemak: Story = {
  args: argsForLayout("colemak"),
};

export const InteractionStates: Story = {
  args: {
    conflicts,
    highlightedSequence: [
      {
        key: { kind: "logical", value: "z" },
        modifiers: { ctrl: true },
      },
    ],
    pressedCodes: new Set(["KeyW"]),
    selectedBindingId: "physical.z",
  },
};

export const LayoutComparison: Story = {
  render: () => <LayoutComparisonStory />,
};
