import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import type { ActionRegistry, Binding, Profile, WhenExpr } from "@moritzbrantner/input-bindings";
import {
  InputBindingsWorkbench,
  type InputBindingsContextScenario,
} from "@moritzbrantner/input-bindings-react/workbench";
import "@moritzbrantner/input-bindings-react/workbench.css";
import "./site.css";

const STORAGE_KEY = "input-bindings-demo-profile-v1";
const PROFILE_ID = "pages-demo-user";

const context = (id: string): WhenExpr => ({ op: "context", id });
const logical = (
  id: string,
  action: string,
  key: string,
  modifiers: Binding["sequence"][number]["modifiers"] = {},
  when: WhenExpr = { op: "always" },
  priority = 0,
): Binding => ({
  id,
  action,
  sequence: [{ key: { kind: "logical", value: key }, modifiers }],
  when,
  priority,
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
const chord = (
  id: string,
  action: string,
  keys: string[],
  when: WhenExpr,
): Binding => ({
  id,
  action,
  sequence: keys.map((key) => ({
    key: { kind: "logical", value: key },
    modifiers: { ctrl: true },
  })),
  when,
  priority: 0,
});

const registry: ActionRegistry = {
  actions: [
    {
      id: "global.commandPalette",
      title: "Command palette",
      description: "Open the global command palette.",
      categoryPath: ["Global"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("global.commandPalette.default", "global.commandPalette", "p", { ctrl: true, shift: true })],
      provenance: { source: "demo-shell", version: "1" },
    },
    {
      id: "global.quickOpen",
      title: "Quick open",
      description: "Open an item by name.",
      categoryPath: ["Global"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("global.quickOpen.default", "global.quickOpen", "p", { ctrl: true })],
      provenance: { source: "demo-shell", version: "1" },
    },
    {
      id: "global.showShortcuts",
      title: "Show shortcuts",
      description: "A deliberately short leader binding used to demonstrate chord-prefix conflicts.",
      categoryPath: ["Global"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("global.showShortcuts.default", "global.showShortcuts", "k", { ctrl: true })],
      provenance: { source: "demo-shell", version: "1" },
    },
    {
      id: "editor.save",
      title: "Save document",
      description: "Save the active document.",
      categoryPath: ["Editor", "File"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("editor.save.default", "editor.save", "s", { ctrl: true }, context("editorFocused"))],
      provenance: { source: "editor-core", version: "1" },
    },
    {
      id: "editor.formatDocument",
      title: "Format document",
      description: "Format the active editor document.",
      categoryPath: ["Editor", "Editing"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("editor.formatDocument.default", "editor.formatDocument", "f", { alt: true, shift: true }, context("editorFocused"))],
      provenance: { source: "editor-core", version: "1" },
    },
    {
      id: "editor.rename",
      title: "Rename symbol",
      categoryPath: ["Editor", "Editing"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("editor.rename.default", "editor.rename", "F2", {}, context("editorFocused"))],
      provenance: { source: "editor-core", version: "1" },
    },
    {
      id: "editor.search",
      title: "Find in editor",
      categoryPath: ["Editor", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("editor.search.default", "editor.search", "f", { ctrl: true }, context("editorFocused"))],
      provenance: { source: "editor-core", version: "1" },
    },
    {
      id: "timeline.addCut",
      title: "Add cut",
      description: "Add a cut at the current timeline position.",
      categoryPath: ["Timeline", "Cuts"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [chord("timeline.addCut.default", "timeline.addCut", ["k", "c"], context("timelineFocused"))],
      provenance: { source: "timeline-editor", version: "1" },
    },
    {
      id: "timeline.removeCut",
      title: "Remove cut",
      categoryPath: ["Timeline", "Cuts"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [chord("timeline.removeCut.default", "timeline.removeCut", ["k", "Backspace"], context("timelineFocused"))],
      provenance: { source: "timeline-editor", version: "1" },
    },
    {
      id: "timeline.nextFrame",
      title: "Next frame",
      categoryPath: ["Timeline", "Navigation"],
      repeatPolicy: "allow",
      allowedDevices: ["keyboard"],
      defaults: [logical("timeline.nextFrame.default", "timeline.nextFrame", "ArrowRight", {}, context("timelineFocused"))],
      provenance: { source: "timeline-editor", version: "1" },
    },
    {
      id: "table.deleteRow",
      title: "Delete selected row",
      categoryPath: ["Table", "Rows"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("table.deleteRow.default", "table.deleteRow", "Delete", {}, context("tableFocused"))],
      provenance: { source: "tables", version: "1" },
    },
    {
      id: "table.deleteColumn",
      title: "Delete selected column",
      categoryPath: ["Table", "Columns"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("table.deleteColumn.default", "table.deleteColumn", "Delete", { ctrl: true }, context("tableFocused"))],
      provenance: { source: "tables", version: "1" },
    },
    {
      id: "game.moveForward",
      title: "Move forward",
      description: "Physical-position movement binding, independent of keyboard layout.",
      categoryPath: ["Game", "Movement"],
      repeatPolicy: "allow",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [physical("game.moveForward.default", "game.moveForward", "KeyW", context("gameplay"))],
      provenance: { source: "gameplay", version: "1" },
    },
    {
      id: "game.jump",
      title: "Jump",
      categoryPath: ["Game", "Movement"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [physical("game.jump.default", "game.jump", "Space", context("gameplay"))],
      provenance: { source: "gameplay", version: "1" },
    },
    {
      id: "game.interact",
      title: "Interact",
      categoryPath: ["Game", "Actions"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [physical("game.interact.default", "game.interact", "KeyE", context("gameplay"))],
      provenance: { source: "gameplay", version: "1" },
    },
    {
      id: "game.pause",
      title: "Pause game",
      categoryPath: ["Game", "System"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [logical("game.pause.default", "game.pause", "Escape", {}, context("gameplay"))],
      provenance: { source: "gameplay", version: "1" },
    },
    {
      id: "game.targetNearest",
      title: "Target nearest object",
      description: "Shares Ctrl+F with editor search in another context to demonstrate context overlap diagnostics.",
      categoryPath: ["Game", "Actions"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard", "gamepad"],
      defaults: [logical("game.targetNearest.default", "game.targetNearest", "f", { ctrl: true }, context("gameplay"))],
      provenance: { source: "gameplay", version: "1" },
    },
    {
      id: "menu.close",
      title: "Close menu",
      description: "Close the current modal menu without allowing the underlying game to react.",
      categoryPath: ["Menu", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("menu.close.default", "menu.close", "Escape", {}, context("menuOpen"))],
      provenance: { source: "demo-shell", version: "1" },
    },
    {
      id: "menu.confirm",
      title: "Confirm menu item",
      categoryPath: ["Menu", "Navigation"],
      repeatPolicy: "never",
      allowedDevices: ["keyboard"],
      defaults: [logical("menu.confirm.default", "menu.confirm", "Enter", {}, context("menuOpen"))],
      provenance: { source: "demo-shell", version: "1" },
    },
  ],
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
    description: "An editor owns the active interaction layer while global commands remain available.",
    activeContexts: ["editorFocused"],
    stack: [{ id: "editorFocused" }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "timeline",
    label: "Timeline focused",
    description: "Timeline chord shortcuts and navigation are active.",
    activeContexts: ["timelineFocused"],
    stack: [{ id: "timelineFocused" }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "table",
    label: "Table focused",
    description: "Table-specific row and column commands are active.",
    activeContexts: ["tableFocused"],
    stack: [{ id: "tableFocused" }],
    defaultKeyboardMode: "logical",
  },
  {
    id: "gameplay",
    label: "Gameplay",
    description: "Physical movement controls are active. Switch matching mode to inspect logical game shortcuts too.",
    activeContexts: ["gameplay"],
    stack: [{ id: "gameplay" }],
    defaultKeyboardMode: "physical",
  },
  {
    id: "pause-menu",
    label: "Gameplay + modal menu",
    description: "The menu sits above gameplay and blocks lower input layers until it closes.",
    activeContexts: ["gameplay", "menuOpen"],
    stack: [{ id: "gameplay" }, { id: "menuOpen", blocksLower: true }],
    defaultKeyboardMode: "logical",
  },
];

function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { id: PROFILE_ID, patches: [] };
    const parsed = JSON.parse(raw) as Partial<Profile>;
    if (typeof parsed.id === "string" && Array.isArray(parsed.patches)) {
      return parsed as Profile;
    }
  } catch {
    // Corrupt local state is ignored rather than reinterpreted.
  }
  return { id: PROFILE_ID, patches: [] };
}

function App() {
  const [profile, setProfile] = useState<Profile>(loadProfile);

  const updateProfile = (next: Profile) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setProfile(next);
  };

  return (
    <main className="site-shell">
      <header className="site-header">
        <div>
          <p className="site-eyebrow">input-bindings / GitHub Pages dogfood</p>
          <h1>Reusable controls settings workbench</h1>
          <p>
            A default settings surface for editors, games, tables, and web applications: browse and edit every shortcut, inspect a spatial keyboard map, then test real key presses against application-owned contexts.
          </p>
        </div>
        <a href="https://github.com/moritzbrantner/input-bindings">Repository</a>
      </header>
      <p className="site-note">
        Switch between editor, timeline, table, gameplay, and a modal pause-menu scenario. The pause menu uses the real ordered-context resolver and blocks lower gameplay controls rather than hiding them only in the UI.
      </p>
      <InputBindingsWorkbench
        registry={registry}
        profile={profile}
        onProfileChange={updateProfile}
        contextScenarios={contextScenarios}
      />
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
