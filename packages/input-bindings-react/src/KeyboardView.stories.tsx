import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Binding, Conflict } from "@moritzbrantner/input-bindings";

import { KeyboardView, type KeyboardViewProps } from "./index.tsx";

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

const qwertz = new Map<string, string>([
  ["KeyY", "z"],
  ["KeyZ", "y"],
  ["BracketLeft", "ü"],
  ["Semicolon", "ö"],
  ["Quote", "ä"],
  ["Minus", "ß"],
]);

const azerty = new Map<string, string>([
  ["KeyQ", "a"],
  ["KeyW", "z"],
  ["KeyA", "q"],
  ["KeyZ", "w"],
  ["Semicolon", "m"],
  ["KeyM", ","],
  ["Comma", ";"],
  ["Period", ":"],
  ["Slash", "!"],
  ["Digit1", "&"],
  ["Digit2", "é"],
  ["Digit3", '"'],
  ["Digit4", "'"],
  ["Digit5", "("],
  ["Digit6", "-"],
  ["Digit7", "è"],
  ["Digit8", "_"],
  ["Digit9", "ç"],
  ["Digit0", "à"],
]);

const dvorak = new Map<string, string>([
  ["KeyQ", "'"],
  ["KeyW", ","],
  ["KeyE", "."],
  ["KeyR", "p"],
  ["KeyT", "y"],
  ["KeyY", "f"],
  ["KeyU", "g"],
  ["KeyI", "c"],
  ["KeyO", "r"],
  ["KeyP", "l"],
  ["KeyA", "a"],
  ["KeyS", "o"],
  ["KeyD", "e"],
  ["KeyF", "u"],
  ["KeyG", "i"],
  ["KeyH", "d"],
  ["KeyJ", "h"],
  ["KeyK", "t"],
  ["KeyL", "n"],
  ["Semicolon", "s"],
  ["KeyZ", ";"],
  ["KeyX", "q"],
  ["KeyC", "j"],
  ["KeyV", "k"],
  ["KeyB", "x"],
  ["KeyN", "b"],
  ["KeyM", "m"],
]);

function KeyboardStory(args: KeyboardViewProps) {
  const [inspection, setInspection] = useState("No key inspected");

  return (
    <main
      className="ib-editor"
      style={{
        margin: "0 auto",
        maxWidth: "980px",
        minHeight: "100vh",
        padding: "2rem",
      }}
    >
      <h1 style={{ marginTop: 0 }}>Keyboard view</h1>
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

export const Qwerty: Story = {};

export const Qwertz: Story = {
  args: {
    layoutLabels: qwertz,
  },
};

export const Azerty: Story = {
  args: {
    layoutLabels: azerty,
  },
};

export const Dvorak: Story = {
  args: {
    layoutLabels: dvorak,
  },
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
