import { useState } from "react";

import type { Meta, StoryObj } from "@storybook/react-vite";
import type {
  ActionRegistry,
  Binding,
  Profile,
  WhenExpr,
} from "@moritzbrantner/input-bindings";

import {
  createStarterMobileControlsOverlay,
  InputBindingsWorkbench,
  type InputBindingsContextScenario,
  type InputBindingsWorkbenchProps,
  type MobileControlsOverlay,
} from "../src/Workbench.tsx";
import "../src/workbench.css";
import "./Workbench.stories.css";

const context = (id: string): WhenExpr => ({ op: "context", id });

const logical = (
  id: string,
  action: string,
  key: string,
  modifiers: Binding["sequence"][number]["modifiers"] = {},
  when: WhenExpr = { op: "always" },
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "logical", value: key }, modifiers }],
  when,
  priority: 0,
});

const physical = (
  id: string,
  action: string,
  code: string,
  when: WhenExpr,
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "physical", value: code } }],
  when,
  priority: 0,
});

const registry: ActionRegistry = {
  actions: [
    {
      id: "global.commandPalette",
      title: "Command palette",
      description: "Open the application command palette.",
      categoryPath: ["Global"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        logical(
          "global.commandPalette.default",
          "global.commandPalette",
          "p",
          { ctrl: true, shift: true },
        ),
      ],
    },
    {
      id: "editor.save",
      title: "Save document",
      description: "Save the active editor document.",
      categoryPath: ["Editor", "File"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        logical(
          "editor.save.default",
          "editor.save",
          "s",
          { ctrl: true },
          context("editorFocused"),
        ),
      ],
    },
    {
      id: "game.jump",
      title: "Jump",
      description: "Physical-position gameplay binding.",
      categoryPath: ["Game", "Movement"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        physical("game.jump.default", "game.jump", "Space", context("gameplay")),
      ],
    },
    {
      id: "game.pause",
      title: "Pause game",
      categoryPath: ["Game", "System"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        logical(
          "game.pause.default",
          "game.pause",
          "Escape",
          {},
          context("gameplay"),
        ),
      ],
    },
    {
      id: "menu.close",
      title: "Close menu",
      categoryPath: ["Menu", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [
        logical(
          "menu.close.default",
          "menu.close",
          "Escape",
          {},
          context("menuOpen"),
        ),
      ],
    },
  ],
};

const profile: Profile = {
  id: "storybook-profile",
  patches: [],
};

const contextScenarios: InputBindingsContextScenario[] = [
  {
    id: "global",
    label: "Global shell",
    description: "Only application-wide shortcuts are active.",
    activeContexts: [],
    stack: [],
    defaultKeyboardMode: "logical",
  },
  {
    id: "editor",
    label: "Editor focused",
    description: "Editor shortcuts are active above global shortcuts.",
    activeContexts: ["editorFocused"],
    stack: [{ id: "editorFocused" }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    description: "Gameplay controls are active.",
    activeContexts: ["gameplay"],
    stack: [{ id: "gameplay" }],
    defaultKeyboardMode: "physical",
  },
  {
    id: "pause-menu",
    label: "Gameplay + modal menu",
    description: "The modal menu blocks lower gameplay input.",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [{ id: "gameplay" }, { id: "menuOpen", blocksLower: true }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "flat-overlap",
    label: "Flat overlap",
    description: "Gameplay and menu contexts are active without stack ordering.",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [],
    defaultKeyboardMode: "logical",
  },
];


const starterMobileOverlay = createStarterMobileControlsOverlay();
const mobileActionByControl = new Map<string, string>([
  ["movement-stick", "game.jump"],
  ["primary-action", "game.jump"],
  ["secondary-action", "menu.close"],
  ["command-dock", "game.pause"],
]);
const storybookMobileOverlay: MobileControlsOverlay = {
  ...starterMobileOverlay,
  controls: starterMobileOverlay.controls.map((control) => {
    const actionId = mobileActionByControl.get(control.id);
    return actionId ? { ...control, actionId } : control;
  }),
};

function StatefulWorkbench(args: InputBindingsWorkbenchProps) {
  const [currentProfile, setCurrentProfile] = useState(args.profile);
  const [currentMobileOverlay, setCurrentMobileOverlay] = useState(
    () => args.mobileOverlay ?? storybookMobileOverlay,
  );

  return (
    <main className="ib-story-workbench">
      <InputBindingsWorkbench
        {...args}
        profile={currentProfile}
        onProfileChange={setCurrentProfile}
        mobileOverlay={currentMobileOverlay}
        onMobileOverlayChange={setCurrentMobileOverlay}
      />
      <output className="ib-story-profile-state" data-testid="profile-state" aria-live="polite">
        Profile patches: {currentProfile.patches.length}
      </output>
      <output className="ib-story-profile-state" data-testid="mobile-overlay-state" aria-live="polite">
        Mobile controls: {currentMobileOverlay.controls.length}
      </output>
    </main>
  );
}

const meta = {
  title: "Input bindings/Workbench",
  component: InputBindingsWorkbench,
  render: (args) => <StatefulWorkbench {...args} />,
  args: {
    registry,
    profile,
    onProfileChange: () => {},
    contextScenarios,
    mobileOverlay: storybookMobileOverlay,
  },
  argTypes: {
    registry: { control: false },
    profile: { control: false },
    onProfileChange: { control: false },
    contextScenarios: { control: false },
    mobileOverlay: { control: false },
    onMobileOverlayChange: { control: false },
  },
} satisfies Meta<typeof InputBindingsWorkbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
  args: {
    initialMode: "shortcuts",
    initialPresentation: "list",
  },
};

export const Keyboard: Story = {
  args: {
    initialMode: "shortcuts",
    initialPresentation: "keyboard",
  },
};

export const Conflicts: Story = {
  args: {
    initialMode: "conflicts",
    initialPresentation: "list",
  },
};

export const Preview: Story = {
  args: {
    initialMode: "preview",
    initialPresentation: "keyboard",
  },
};

export const MobileSettings: Story = {
  args: {
    initialMode: "shortcuts",
    initialPresentation: "list",
    title: "Controls",
    description: "Compact mobile settings with precise manual shortcut editing.",
  },
};
